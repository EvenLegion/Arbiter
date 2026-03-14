import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { applyDatabaseTestEnv, startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';

describe('user record integration', () => {
	let databaseUrl: string;
	let postgresContainer: Awaited<ReturnType<typeof startPostgresTestContainer>>['postgres'];
	let standalone: StandalonePrisma;
	let upsertUser: typeof import('../../../src/integrations/prisma/upsertUser').upsertUser;
	let findUniqueUser: typeof import('../../../src/integrations/prisma/findUniqueUser').findUniqueUser;
	let updateUserNickname: typeof import('../../../src/integrations/prisma/updateUserNickname').updateUserNickname;
	let closeDb: typeof import('../../../src/integrations/prisma/prisma').closeDb;

	beforeAll(async () => {
		const { postgres, databaseUrl: nextDatabaseUrl } = await startPostgresTestContainer();
		postgresContainer = postgres;
		databaseUrl = nextDatabaseUrl;
		applyDatabaseTestEnv(databaseUrl);
		pushPrismaSchema(databaseUrl);
		standalone = createStandalonePrisma(databaseUrl);
		vi.resetModules();
		({ upsertUser } = await import('../../../src/integrations/prisma/upsertUser'));
		({ findUniqueUser } = await import('../../../src/integrations/prisma/findUniqueUser'));
		({ updateUserNickname } = await import('../../../src/integrations/prisma/updateUserNickname'));
		({ closeDb } = await import('../../../src/integrations/prisma/prisma'));
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

	it('creates a user and resolves it by both Discord ID and DB ID', async () => {
		const created = await upsertUser({
			discordUserId: '4101',
			discordUsername: 'first-user',
			discordNickname: 'FirstUser',
			discordAvatarUrl: 'https://example.com/4101.png'
		});

		await expect(
			findUniqueUser({
				discordUserId: created.discordUserId
			})
		).resolves.toMatchObject({
			id: created.id,
			discordUsername: 'first-user',
			discordNickname: 'FirstUser'
		});
		await expect(
			findUniqueUser({
				dbUserId: created.id
			})
		).resolves.toMatchObject({
			discordUserId: '4101',
			discordUsername: 'first-user'
		});
	});

	it('does not overwrite the persisted nickname unless explicitly requested', async () => {
		const created = await upsertUser({
			discordUserId: '4102',
			discordUsername: 'existing-user',
			discordNickname: 'ExistingNick',
			discordAvatarUrl: 'https://example.com/4102-a.png'
		});

		const updated = await upsertUser({
			discordUserId: '4102',
			discordUsername: 'renamed-user',
			discordNickname: 'NewNicknameShouldNotPersist',
			discordAvatarUrl: 'https://example.com/4102-b.png'
		});

		expect(updated.id).toBe(created.id);
		expect(updated.discordUsername).toBe('renamed-user');
		expect(updated.discordAvatarUrl).toBe('https://example.com/4102-b.png');
		expect(updated.discordNickname).toBe('ExistingNick');
	});

	it('overwrites the persisted nickname when explicitly requested and supports standalone nickname updates', async () => {
		const created = await upsertUser({
			discordUserId: '4103',
			discordUsername: 'nickname-user',
			discordNickname: 'OriginalNick',
			discordAvatarUrl: 'https://example.com/4103-a.png'
		});

		await upsertUser({
			discordUserId: created.discordUserId,
			discordUsername: 'nickname-user',
			discordNickname: 'OverwrittenNick',
			discordAvatarUrl: 'https://example.com/4103-b.png',
			overwriteDiscordNickname: true
		});
		await updateUserNickname({
			discordUserId: created.discordUserId,
			discordNickname: 'FinalNick'
		});

		await expect(
			findUniqueUser({
				discordUserId: created.discordUserId
			})
		).resolves.toMatchObject({
			discordNickname: 'FinalNick'
		});
	});
});
