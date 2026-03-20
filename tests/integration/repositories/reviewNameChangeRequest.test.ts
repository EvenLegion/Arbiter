import { NameChangeRequestStatus } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { applyDatabaseTestEnv, startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';

describe('reviewNameChangeRequest integration', () => {
	let databaseUrl: string;
	let postgresContainer: Awaited<ReturnType<typeof startPostgresTestContainer>>['postgres'];
	let standalone: StandalonePrisma;
	let nameChangeRepository: typeof import('../../../src/integrations/prisma/repositories').nameChangeRepository;
	let closeDb: typeof import('../../../src/integrations/prisma').closeDb;

	beforeAll(async () => {
		const { postgres, databaseUrl: nextDatabaseUrl } = await startPostgresTestContainer();
		postgresContainer = postgres;
		databaseUrl = nextDatabaseUrl;
		applyDatabaseTestEnv(databaseUrl);
		pushPrismaSchema(databaseUrl);
		standalone = createStandalonePrisma(databaseUrl);
		vi.resetModules();
		({ nameChangeRepository } = await import('../../../src/integrations/prisma/repositories'));
		({ closeDb } = await import('../../../src/integrations/prisma'));
	});

	beforeEach(async () => {
		await resetDatabase(standalone.prisma);
		await seedReferenceData(standalone.prisma);
	});

	afterAll(async () => {
		if (closeDb) {
			await closeDb();
		}
		if (standalone) {
			await standalone.close();
		}
		if (postgresContainer) {
			await stopPostgresTestContainer(postgresContainer);
		}
	});

	it('approves a pending request and records the reviewer', async () => {
		const requester = await createUser(standalone.prisma, {
			discordUserId: '1001',
			discordUsername: 'requester'
		});
		const reviewer = await createUser(standalone.prisma, {
			discordUserId: '2001',
			discordUsername: 'reviewer'
		});
		const request = await standalone.prisma.nameChangeRequest.create({
			data: {
				requesterUserId: requester.id,
				currentName: 'OldName',
				requestedName: 'NewName',
				reason: 'Fresh start'
			}
		});

		const result = await nameChangeRepository.reviewRequest({
			requestId: request.id,
			reviewerDbUserId: reviewer.id,
			decision: 'approve'
		});

		expect(result).toMatchObject({
			id: request.id,
			status: NameChangeRequestStatus.APPROVED,
			requestedName: 'NewName',
			requesterUser: {
				discordUserId: requester.discordUserId
			}
		});

		const persisted = await standalone.prisma.nameChangeRequest.findUniqueOrThrow({
			where: {
				id: request.id
			}
		});
		expect(persisted.status).toBe(NameChangeRequestStatus.APPROVED);
		expect(persisted.reviewerUserId).toBe(reviewer.id);
		expect(persisted.reviewedAt).toBeInstanceOf(Date);
	});

	it('denies a pending request', async () => {
		const requester = await createUser(standalone.prisma, {
			discordUserId: '1002',
			discordUsername: 'requester-two'
		});
		const reviewer = await createUser(standalone.prisma, {
			discordUserId: '2002',
			discordUsername: 'reviewer-two'
		});
		const request = await standalone.prisma.nameChangeRequest.create({
			data: {
				requesterUserId: requester.id,
				currentName: 'OldNameTwo',
				requestedName: 'NewNameTwo',
				reason: 'Reason two'
			}
		});

		const result = await nameChangeRepository.reviewRequest({
			requestId: request.id,
			reviewerDbUserId: reviewer.id,
			decision: 'deny'
		});

		expect(result).toMatchObject({
			id: request.id,
			status: NameChangeRequestStatus.DENIED
		});
	});

	it('returns null when the request is no longer pending', async () => {
		const requester = await createUser(standalone.prisma, {
			discordUserId: '1003',
			discordUsername: 'requester-three'
		});
		const reviewer = await createUser(standalone.prisma, {
			discordUserId: '2003',
			discordUsername: 'reviewer-three'
		});
		const request = await standalone.prisma.nameChangeRequest.create({
			data: {
				requesterUserId: requester.id,
				currentName: 'OldNameThree',
				requestedName: 'NewNameThree',
				reason: 'Reason three',
				status: NameChangeRequestStatus.APPROVED
			}
		});

		const result = await nameChangeRepository.reviewRequest({
			requestId: request.id,
			reviewerDbUserId: reviewer.id,
			decision: 'deny'
		});

		expect(result).toBeNull();
	});
});

async function createUser(
	prisma: StandalonePrisma['prisma'],
	{ discordUserId, discordUsername }: { discordUserId: string; discordUsername: string }
) {
	return prisma.user.create({
		data: {
			discordUserId,
			discordUsername,
			discordNickname: discordUsername,
			discordAvatarUrl: `https://example.com/${discordUserId}.png`
		}
	});
}
