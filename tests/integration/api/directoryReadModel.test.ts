import { MeritTypeCode, Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildDirectorySql, createPrismaDirectoryRepository } from '../../../apps/api/src/directory/prismaRepository';
import { createDirectoryService } from '../../../apps/api/src/directory/service';
import type { DirectoryService } from '../../../apps/api/src/directory/types';
import { createDivision, createUser } from '../setup/fixtures';
import { createStandalonePrisma, deployPrismaMigrations, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

describe('API directory read model', () => {
	let postgres: StartedPostgreSqlContainer;
	let databaseUrl: string;
	let standalone: StandalonePrisma;
	let service: DirectoryService;

	beforeAll(async () => {
		const started = await startPostgresTestContainer();
		postgres = started.postgres;
		databaseUrl = started.databaseUrl;
		deployPrismaMigrations(started.databaseUrl);
		standalone = createStandalonePrisma(started.databaseUrl);
	});

	beforeEach(async () => {
		await resetDatabase(standalone.prisma);
		await seedReferenceData(standalone.prisma);
		service = createDirectoryService(createPrismaDirectoryRepository(standalone.prisma));
	});

	afterAll(async () => {
		await standalone?.close();
		await stopPostgresTestContainer(postgres);
	});

	it('hydrates canonical totals and every membership with stable bounded pagination', async () => {
		const fixture = await seedDirectoryFixture();

		const first = await service.query({ limit: 2 });
		expect(first.ok).toBe(true);
		if (!first.ok) throw new Error('Expected the first directory page to succeed');
		expect(first.value.nextCursor).not.toBeNull();
		if (!first.value.nextCursor) throw new Error('Expected the first directory page to include a cursor');
		expect(first.value.users).toEqual([
			{
				discordUserId: fixture.zero.discordUserId,
				memberships: [
					{ divisionCode: 'LGN', divisionName: 'Legionnaire', divisionKind: 'LEGIONNAIRE' },
					{ divisionCode: 'STAFF', divisionName: 'Staff', divisionKind: 'STAFF' }
				],
				totalMerits: 0,
				rankLevel: null,
				rankSymbol: null
			},
			expect.objectContaining({ discordUserId: fixture.rankThree.discordUserId, totalMerits: 7, rankLevel: 3 })
		]);

		const second = await service.query({ limit: 2, cursor: first.value.nextCursor });
		expect(second.ok).toBe(true);
		if (!second.ok) return;
		expect(second.value.users.map(({ discordUserId }) => discordUserId)).toEqual([fixture.negative.discordUserId, fixture.rankOne.discordUserId]);
		expect(second.value.nextCursor).toBeNull();
		expect(second.value.users[0]).toMatchObject({ totalMerits: -1, rankLevel: null, rankSymbol: null });
		expect(second.value.users[1]).toMatchObject({ totalMerits: 1, rankLevel: 1 });
	});

	it('ANDs ID, division, and rank categories while ORing division codes', async () => {
		const fixture = await seedDirectoryFixture();

		const combined = await service.query({
			discordUserIds: [fixture.zero.discordUserId, fixture.rankThree.discordUserId, fixture.rankOne.discordUserId],
			divisionCodesAny: ['LGN', 'NVY'],
			minimumRank: 1,
			maximumRank: 1
		});
		expect(combined.ok).toBe(true);
		if (!combined.ok) return;
		expect(combined.value.users).toHaveLength(1);
		expect(combined.value.users[0]).toMatchObject({
			discordUserId: fixture.rankOne.discordUserId,
			rankLevel: 1,
			memberships: [
				{ divisionCode: 'LGN', divisionName: 'Legionnaire', divisionKind: 'LEGIONNAIRE' },
				{ divisionCode: 'NVY', divisionName: 'Navy', divisionKind: 'NAVY' }
			]
		});

		const exact = await service.query({ exactRank: 3, divisionCodesAny: ['STAFF', 'RES'] });
		expect(exact.ok).toBe(true);
		if (exact.ok) expect(exact.value.users.map(({ discordUserId }) => discordUserId)).toEqual([fixture.rankThree.discordUserId]);
	});

	it('returns no invented users and rejects unknown divisions and malformed cursors', async () => {
		await seedDirectoryFixture();
		await expect(service.query({ discordUserIds: ['999999999999999999'] })).resolves.toEqual({
			ok: true,
			value: { users: [], nextCursor: null }
		});
		await expect(service.query({ divisionCodesAny: ['MISSING'] })).resolves.toEqual({
			ok: false,
			error: { code: 'unknown_divisions', divisionCodes: ['MISSING'] }
		});
		await expect(service.query({ cursor: 'bm90LWpzb24' })).resolves.toEqual({ ok: false, error: { code: 'invalid_input' } });
	});

	it('uses the canonical Discord ID index for a representative direct lookup plan', async () => {
		await standalone.prisma.user.createMany({
			data: Array.from({ length: 2_000 }, (_, index) => ({
				discordUserId: `${100000000000000000n + BigInt(index)}`,
				discordUsername: `plan-user-${index}`,
				discordNickname: `Plan User ${index}`,
				discordAvatarUrl: `https://example.com/plan-user-${index}.png`
			}))
		});
		await standalone.prisma.$executeRaw`ANALYZE "User"`;
		const plan = await standalone.prisma.$queryRaw<unknown[]>(
			Prisma.sql`EXPLAIN (FORMAT JSON) ${buildDirectorySql({ discordUserIds: ['100000000000001999'], limit: 2 })}`
		);
		expect(JSON.stringify(plan)).toContain('User_discordUserId_key');
	});

	it('cancels a directory statement that cannot complete before the request deadline', async () => {
		const division = await createDivision(standalone.prisma, { code: 'LOCKED' });
		let releaseLock: (() => void) | undefined;
		const release = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});
		let markLocked: (() => void) | undefined;
		const locked = new Promise<void>((resolve) => {
			markLocked = resolve;
		});
		const lockTransaction = standalone.prisma.$transaction(async (tx) => {
			await tx.$executeRawUnsafe('LOCK TABLE "Division" IN ACCESS EXCLUSIVE MODE');
			markLocked?.();
			await release;
		});
		await locked;

		const deadlineAtMs = Date.now() + 100;
		const ciSchedulingToleranceMs = 400;
		try {
			await expect(service.query({ divisionCodesAny: [division.code] }, undefined, deadlineAtMs)).rejects.toThrow(
				/statement timeout|deadline exceeded/i
			);
			expect(Date.now()).toBeLessThanOrEqual(deadlineAtMs + ciSchedulingToleranceMs);
		} finally {
			releaseLock?.();
			await lockTransaction;
		}
	});

	it('includes directory pool acquisition in the request deadline', async () => {
		const constrained = createStandalonePrisma(databaseUrl, { max: 1 });
		const constrainedService = createDirectoryService(createPrismaDirectoryRepository(constrained.prisma));
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
		await connectionHeld;

		const deadlineAtMs = Date.now() + 250;
		const ciSchedulingToleranceMs = 400;
		const releaseTimer = setTimeout(() => releaseConnection?.(), 700);
		try {
			await expect(constrainedService.query({}, undefined, deadlineAtMs)).rejects.toThrow(
				/unable to start a transaction|transaction.*(?:closed|expired)|deadline exceeded/i
			);
			expect(Date.now()).toBeLessThanOrEqual(deadlineAtMs + ciSchedulingToleranceMs);
		} finally {
			clearTimeout(releaseTimer);
			releaseConnection?.();
			await connectionTransaction;
			await constrained.close();
		}
	});

	async function seedDirectoryFixture() {
		const [zero, rankThree, negative, rankOne] = await Promise.all([
			createUser(standalone.prisma, { discordUserId: '100000000000000001' }),
			createUser(standalone.prisma, { discordUserId: '100000000000000002' }),
			createUser(standalone.prisma, { discordUserId: '100000000000000003' }),
			createUser(standalone.prisma, { discordUserId: '100000000000000004' })
		]);
		const [lgn, staff, reserve, navy] = await Promise.all([
			createDivision(standalone.prisma, { code: 'LGN', name: 'Legionnaire', showRank: false }),
			createDivision(standalone.prisma, { code: 'STAFF', name: 'Staff', kind: 'STAFF', showRank: false }),
			createDivision(standalone.prisma, { code: 'RES', name: 'Reserve', kind: 'RESERVE', showRank: false }),
			createDivision(standalone.prisma, { code: 'NVY', name: 'Navy', kind: 'NAVY', showRank: false })
		]);
		await standalone.prisma.divisionMembership.createMany({
			data: [
				{ userId: zero.id, divisionId: lgn.id },
				{ userId: zero.id, divisionId: staff.id },
				{ userId: rankThree.id, divisionId: reserve.id },
				{ userId: negative.id, divisionId: lgn.id },
				{ userId: rankOne.id, divisionId: lgn.id },
				{ userId: rankOne.id, divisionId: navy.id }
			]
		});
		const [tierOne, tierThree, demerit] = await Promise.all([
			standalone.prisma.meritType.findUniqueOrThrow({ where: { code: MeritTypeCode.TIER_1 } }),
			standalone.prisma.meritType.findUniqueOrThrow({ where: { code: MeritTypeCode.TIER_3 } }),
			standalone.prisma.meritType.findUniqueOrThrow({ where: { code: MeritTypeCode.DEMERIT } })
		]);
		await standalone.prisma.merit.createMany({
			data: [
				{ userId: rankThree.id, awardedByUserId: zero.id, meritTypeId: tierThree.id },
				{ userId: rankThree.id, awardedByUserId: zero.id, meritTypeId: tierThree.id },
				{ userId: rankThree.id, awardedByUserId: zero.id, meritTypeId: tierOne.id },
				{ userId: negative.id, awardedByUserId: zero.id, meritTypeId: demerit.id },
				{ userId: rankOne.id, awardedByUserId: zero.id, meritTypeId: tierOne.id }
			]
		});
		return { zero, rankThree, negative, rankOne };
	}
});
