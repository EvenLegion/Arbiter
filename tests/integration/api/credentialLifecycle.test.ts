import type { ApiCredentialMetadata } from '@arbiter/api-contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { generateApiCredential } from '../../../apps/api/src/credentials/crypto';
import { createPrismaApiCredentialRepository } from '../../../apps/api/src/credentials/prismaRepository';
import { createApiCredentialService } from '../../../apps/api/src/credentials/service';
import type { ApiCredentialActor, ApiCredentialService } from '../../../apps/api/src/credentials/types';
import { createUser } from '../setup/fixtures';
import { createStandalonePrisma, deployPrismaMigrations, resetDatabase, type StandalonePrisma } from '../setup/database';
import { startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

const PEPPER = 'integration-test-credential-pepper-at-least-32-characters';
const START_TIME = new Date('2026-08-09T08:00:00.000Z');

describe('API integration and credential lifecycle', () => {
	let postgres: StartedPostgreSqlContainer;
	let databaseUrl: string;
	let standalone: StandalonePrisma;
	let currentTime: Date;
	let service: ApiCredentialService;
	let creator: ApiCredentialActor;
	let otherStaff: ApiCredentialActor;
	let execActor: ApiCredentialActor;

	beforeAll(async () => {
		const started = await startPostgresTestContainer();
		postgres = started.postgres;
		databaseUrl = started.databaseUrl;
		deployPrismaMigrations(started.databaseUrl);
		standalone = createStandalonePrisma(started.databaseUrl);
	});

	beforeEach(async () => {
		await resetDatabase(standalone.prisma);
		currentTime = new Date(START_TIME);
		const [creatorUser, otherUser, execUser] = await Promise.all([
			createUser(standalone.prisma, { discordUserId: '100000000000000001' }),
			createUser(standalone.prisma, { discordUserId: '100000000000000002' }),
			createUser(standalone.prisma, { discordUserId: '100000000000000003' })
		]);
		creator = { userId: creatorUser.id, role: 'STAFF' };
		otherStaff = { userId: otherUser.id, role: 'STAFF' };
		execActor = { userId: execUser.id, role: 'EXEC' };
		service = createApiCredentialService({
			repository: createPrismaApiCredentialRepository(standalone.prisma),
			pepper: PEPPER,
			now: () => new Date(currentTime)
		});
	});

	afterAll(async () => {
		await standalone?.close();
		await stopPostgresTestContainer(postgres);
	});

	it('applies additively, uses canonical users, and preserves first archive audit data', async () => {
		const tables = await standalone.prisma.$queryRaw<Array<{ table_name: string }>>`
			SELECT table_name
			FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name IN ('User', 'ApiIntegration', 'ApiCredential')
			ORDER BY table_name
		`;
		expect(tables.map(({ table_name }) => table_name)).toEqual(['ApiCredential', 'ApiIntegration', 'User']);

		const created = await service.createIntegration(creator, { name: 'Data Export', purpose: 'Read canonical member data' });
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		await expect(standalone.prisma.user.findUnique({ where: { id: creator.userId } })).resolves.toMatchObject({
			discordUserId: '100000000000000001'
		});
		expect(await service.createIntegration(otherStaff, { name: '  data   export ', purpose: 'Duplicate' })).toEqual({
			ok: false,
			error: { code: 'conflict' }
		});
		expect(
			await service.editIntegration(otherStaff, {
				integrationId: created.value.id,
				name: 'Renamed',
				purpose: 'No',
				expectedUpdatedAt: created.value.updatedAt
			})
		).toEqual({
			ok: false,
			error: { code: 'forbidden' }
		});

		const edited = await service.editIntegration(creator, {
			integrationId: created.value.id,
			name: 'Member Directory',
			purpose: 'Read canonical user records',
			expectedUpdatedAt: created.value.updatedAt
		});
		expect(edited).toMatchObject({ ok: true, value: { name: 'Member Directory', updatedByUserId: creator.userId } });
		if (!edited.ok) return;
		expect(
			await service.editIntegration(creator, {
				integrationId: created.value.id,
				name: 'Stale overwrite',
				purpose: 'Must not win',
				expectedUpdatedAt: created.value.updatedAt
			})
		).toEqual({ ok: false, error: { code: 'stale' } });
		expect(await service.archiveIntegration(creator, { integrationId: created.value.id, expectedUpdatedAt: edited.value.updatedAt })).toEqual({
			ok: false,
			error: { code: 'forbidden' }
		});

		const archived = await service.archiveIntegration(execActor, {
			integrationId: created.value.id,
			expectedUpdatedAt: edited.value.updatedAt
		});
		expect(archived).toMatchObject({ ok: true, value: { state: 'archived', archivedByUserId: execActor.userId } });
		currentTime = new Date(currentTime.getTime() + 60_000);
		const repeated = await service.archiveIntegration(
			{ ...execActor, userId: creator.userId },
			{ integrationId: created.value.id, expectedUpdatedAt: created.value.updatedAt }
		);
		expect(repeated).toEqual(archived);
	});

	it('rolls back a registry write when its request is already cancelled', async () => {
		const controller = new AbortController();
		controller.abort(new Error('request ended'));

		await expect(
			service.createIntegration(creator, { name: 'Cancelled client', purpose: 'Must not persist' }, controller.signal)
		).rejects.toThrow('request ended');
		expect(await standalone.prisma.apiIntegration.count()).toBe(0);
	});

	it('mints one-time secrets, authenticates safely, and bounds last-use writes', async () => {
		const integration = await createIntegration();
		const minted = await service.mintCredential(creator, {
			integrationId: integration.id,
			label: 'Production reader',
			scopes: ['users:read']
		});
		expect(minted.ok).toBe(true);
		if (!minted.ok) return;

		expect(minted.value.secret).toMatch(/^arb_v1_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/);
		expect(minted.value.credential).toMatchObject({
			integrationId: integration.id,
			label: 'Production reader',
			scopes: ['users:read'],
			status: 'active'
		});
		expect(JSON.stringify(minted.value.credential)).not.toContain('verifier');
		expect(JSON.stringify(minted.value.credential)).not.toContain(minted.value.secret);
		const registry = await service.listIntegrations(creator);
		expect(registry).toMatchObject({
			ok: true,
			value: [{ credentialCount: 1, creator: { userId: creator.userId, discordNickname: 'user-100000000000000001' } }]
		});

		const stored = await standalone.prisma.apiCredential.findUniqueOrThrow({ where: { id: minted.value.credential.id } });
		expect(stored.verifier).toMatch(/^[a-f0-9]{64}$/);
		expect(JSON.stringify(stored)).not.toContain(minted.value.secret);

		const fallbackCredential = generateApiCredential();
		let generationCount = 0;
		const collisionService = createApiCredentialService({
			repository: createPrismaApiCredentialRepository(standalone.prisma),
			pepper: PEPPER,
			now: () => new Date(currentTime),
			generateCredential: () => {
				generationCount += 1;
				return generationCount === 1 ? { prefix: stored.prefix, secret: minted.value.secret } : fallbackCredential;
			}
		});
		const retriedMint = await collisionService.mintCredential(creator, {
			integrationId: integration.id,
			label: 'Rotation reader',
			scopes: ['users:read']
		});
		expect(retriedMint).toMatchObject({ ok: true, value: { credential: { prefix: fallbackCredential.prefix } } });
		expect(generationCount).toBe(2);

		expect(await service.authenticate('malformed')).toEqual({ ok: false, error: { code: 'invalid_credential' } });
		const unknown = minted.value.secret.replace(stored.prefix, 'AAAAAAAAAAAA');
		expect(await service.authenticate(unknown)).toEqual({ ok: false, error: { code: 'invalid_credential' } });

		const authenticated = await service.authenticate(minted.value.secret);
		expect(authenticated).toMatchObject({
			ok: true,
			value: { credentialId: stored.id, integrationId: integration.id, scopes: ['users:read'] }
		});
		const firstLastUsedAt = (await standalone.prisma.apiCredential.findUniqueOrThrow({ where: { id: stored.id } })).lastUsedAt;
		expect(firstLastUsedAt).toEqual(START_TIME);

		currentTime = new Date(START_TIME.getTime() + 60_000);
		await service.authenticate(minted.value.secret);
		expect((await standalone.prisma.apiCredential.findUniqueOrThrow({ where: { id: stored.id } })).lastUsedAt).toEqual(firstLastUsedAt);

		currentTime = new Date(START_TIME.getTime() + 6 * 60_000);
		await service.authenticate(minted.value.secret);
		expect((await standalone.prisma.apiCredential.findUniqueOrThrow({ where: { id: stored.id } })).lastUsedAt).toEqual(currentTime);
	});

	it('bounds credential lookup and last-use statements by the request deadline', async () => {
		const integration = await createIntegration();
		const minted = await service.mintCredential(creator, {
			integrationId: integration.id,
			label: 'Deadline reader',
			scopes: ['users:read']
		});
		if (!minted.ok) throw new Error(`Credential setup failed: ${minted.error.code}`);

		await expectAuthenticationDeadline(async (tx) => {
			await tx.$executeRawUnsafe('LOCK TABLE "ApiCredential" IN ACCESS EXCLUSIVE MODE');
		}, minted.value.secret);
		await expectAuthenticationDeadline(async (tx) => {
			await tx.$queryRaw`SELECT "id" FROM "ApiCredential" WHERE "id" = ${minted.value.credential.id} FOR UPDATE`;
		}, minted.value.secret);
	});

	it('includes credential pool acquisition in the request deadline', async () => {
		const integration = await createIntegration();
		const minted = await service.mintCredential(creator, {
			integrationId: integration.id,
			label: 'Pool deadline reader',
			scopes: ['users:read']
		});
		if (!minted.ok) throw new Error(`Credential setup failed: ${minted.error.code}`);

		const constrained = createStandalonePrisma(databaseUrl, { max: 1 });
		const constrainedService = createApiCredentialService({
			repository: createPrismaApiCredentialRepository(constrained.prisma),
			pepper: PEPPER,
			now: () => new Date(currentTime)
		});
		let releaseConnection: (() => void) | undefined;
		const connectionRelease = new Promise<void>((resolve) => {
			releaseConnection = resolve;
		});
		let markConnectionHeld: (() => void) | undefined;
		const connectionHeld = new Promise<void>((resolve) => {
			markConnectionHeld = resolve;
		});
		const connectionTransaction = constrained.prisma.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT 1`;
			markConnectionHeld?.();
			await connectionRelease;
		});

		let releaseTable: (() => void) | undefined;
		const tableRelease = new Promise<void>((resolve) => {
			releaseTable = resolve;
		});
		let markTableLocked: (() => void) | undefined;
		const tableLocked = new Promise<void>((resolve) => {
			markTableLocked = resolve;
		});
		const tableLockTransaction = standalone.prisma.$transaction(async (tx) => {
			await tx.$executeRawUnsafe('LOCK TABLE "ApiCredential" IN ACCESS EXCLUSIVE MODE');
			markTableLocked?.();
			await tableRelease;
		});

		await Promise.all([connectionHeld, tableLocked]);
		const deadlineAtMs = Date.now() + 500;
		const ciSchedulingToleranceMs = 200;
		const releaseTimer = setTimeout(() => releaseConnection?.(), 350);
		try {
			await expect(constrainedService.authenticate(minted.value.secret, undefined, deadlineAtMs)).rejects.toThrow(
				/statement timeout|transaction.*(?:closed|expired)|unable to start a transaction|deadline exceeded/i
			);
			expect(Date.now()).toBeLessThanOrEqual(deadlineAtMs + ciSchedulingToleranceMs);
		} finally {
			clearTimeout(releaseTimer);
			releaseConnection?.();
			releaseTable?.();
			await Promise.all([connectionTransaction, tableLockTransaction]);
			await constrained.close();
		}
	});

	it('rejects unsupported scopes and expiry outside the one-year boundary', async () => {
		const integration = await createIntegration();
		expect(
			await service.mintCredential(creator, {
				integrationId: integration.id,
				label: 'Invalid scope',
				scopes: ['invalid:scope' as 'users:read']
			})
		).toEqual({ ok: false, error: { code: 'invalid_input' } });

		const tooLate = new Date(START_TIME);
		tooLate.setUTCFullYear(tooLate.getUTCFullYear() + 1);
		tooLate.setUTCDate(tooLate.getUTCDate() + 1);
		expect(
			await service.mintCredential(creator, {
				integrationId: integration.id,
				label: 'Too long',
				scopes: ['users:read'],
				expiresAt: tooLate
			})
		).toEqual({ ok: false, error: { code: 'invalid_input' } });
	});

	it('preserves first revocation audit data and invalidates revoked, expired, and archived credentials', async () => {
		const integration = await createIntegration();
		const minted = await mint(integration.id, new Date(START_TIME.getTime() + 60 * 60_000));

		expect(await service.revokeCredential(otherStaff, minted.credential.id)).toEqual({ ok: false, error: { code: 'forbidden' } });
		const [creatorResult, execResult] = await Promise.all([
			service.revokeCredential(creator, minted.credential.id),
			service.revokeCredential(execActor, minted.credential.id)
		]);
		expect(creatorResult.ok).toBe(true);
		expect(execResult.ok).toBe(true);
		const revoked = await standalone.prisma.apiCredential.findUniqueOrThrow({ where: { id: minted.credential.id } });
		expect([creator.userId, execActor.userId]).toContain(revoked.revokedByUserId);
		expect(creatorResult).toMatchObject({ ok: true, value: { revokedByUserId: revoked.revokedByUserId } });
		expect(execResult).toMatchObject({ ok: true, value: { revokedByUserId: revoked.revokedByUserId } });
		expect(await service.authenticate(minted.secret)).toEqual({ ok: false, error: { code: 'invalid_credential' } });

		const expiring = await mint(integration.id, new Date(START_TIME.getTime() + 10_000));
		currentTime = new Date(START_TIME.getTime() + 11_000);
		expect(await service.authenticate(expiring.secret)).toEqual({ ok: false, error: { code: 'invalid_credential' } });

		currentTime = new Date(START_TIME);
		const archivedCredential = await mint(integration.id, new Date(START_TIME.getTime() + 60 * 60_000));
		await service.archiveIntegration(execActor, { integrationId: integration.id, expectedUpdatedAt: integration.updatedAt });
		expect(await service.authenticate(archivedCredential.secret)).toEqual({ ok: false, error: { code: 'invalid_credential' } });
		const listed = await service.listCredentials(creator, integration.id);
		expect(listed).toMatchObject({ ok: true });
		if (listed.ok) expect(listed.value.every((credential) => credential.status === 'integration_archived')).toBe(true);
	});

	it('serializes concurrent mint and archive so no credential remains usable', async () => {
		const integration = await createIntegration();
		const [mintResult] = await Promise.all([
			service.mintCredential(creator, {
				integrationId: integration.id,
				label: 'Racing mint',
				scopes: ['users:read']
			}),
			service.archiveIntegration(execActor, { integrationId: integration.id, expectedUpdatedAt: integration.updatedAt })
		]);

		if (mintResult.ok) {
			expect(await service.authenticate(mintResult.value.secret)).toEqual({ ok: false, error: { code: 'invalid_credential' } });
		} else {
			expect(mintResult.error.code).toBe('integration_archived');
		}
	});

	async function createIntegration() {
		const result = await service.createIntegration(creator, { name: 'Directory client', purpose: 'Read users' });
		if (!result.ok) throw new Error(`Integration setup failed: ${result.error.code}`);
		return result.value;
	}

	async function mint(integrationId: string, expiresAt: Date): Promise<{ credential: ApiCredentialMetadata; secret: string }> {
		const result = await service.mintCredential(creator, {
			integrationId,
			label: `Key ${expiresAt.toISOString()}`,
			scopes: ['users:read'],
			expiresAt
		});
		if (!result.ok) throw new Error(`Credential setup failed: ${result.error.code}`);
		return result.value;
	}

	async function expectAuthenticationDeadline(
		acquireLock: (tx: Parameters<Parameters<StandalonePrisma['prisma']['$transaction']>[0]>[0]) => Promise<void>,
		secret: string
	): Promise<void> {
		let releaseLock: (() => void) | undefined;
		const release = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});
		let markLocked: (() => void) | undefined;
		const locked = new Promise<void>((resolve) => {
			markLocked = resolve;
		});
		const lockTransaction = standalone.prisma.$transaction(async (tx) => {
			await acquireLock(tx);
			markLocked?.();
			await release;
		});
		await locked;
		const deadlineAtMs = Date.now() + 100;
		const ciSchedulingToleranceMs = 400;
		try {
			await expect(service.authenticate(secret, undefined, deadlineAtMs)).rejects.toThrow(
				/statement timeout|transaction.*(?:closed|expired)|unable to start a transaction|deadline exceeded/i
			);
			expect(Date.now()).toBeLessThanOrEqual(deadlineAtMs + ciSchedulingToleranceMs);
		} finally {
			releaseLock?.();
			await lockTransaction;
		}
	}
});
