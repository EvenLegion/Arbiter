import { container } from '@sapphire/framework';
import { DivisionKind } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { createDivision, createUser } from '../setup/fixtures';
import { applyDatabaseTestEnv, startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';
import { createMockLogger } from '../../support/logger';

describe('division membership integration', () => {
	let databaseUrl: string;
	let postgresContainer: Awaited<ReturnType<typeof startPostgresTestContainer>>['postgres'];
	let standalone: StandalonePrisma;
	let createManyDivisionMembership: typeof import('../../../src/integrations/prisma/createManyDivisionMembership').createManyDivisionMembership;
	let deleteManyDivisionMembership: typeof import('../../../src/integrations/prisma/deleteManyDivisionMembership').deleteManyDivisionMembership;
	let findManyUsersDivisions: typeof import('../../../src/integrations/prisma/findManyUsersDivisions').findManyUsersDivisions;
	let closeDb: typeof import('../../../src/integrations/prisma/prisma').closeDb;

	beforeAll(async () => {
		const { postgres, databaseUrl: nextDatabaseUrl } = await startPostgresTestContainer();
		postgresContainer = postgres;
		databaseUrl = nextDatabaseUrl;
		applyDatabaseTestEnv(databaseUrl);
		pushPrismaSchema(databaseUrl);
		standalone = createStandalonePrisma(databaseUrl);
		(container as { logger?: unknown }).logger = createMockLogger();
		vi.resetModules();
		({ createManyDivisionMembership } = await import('../../../src/integrations/prisma/createManyDivisionMembership'));
		({ deleteManyDivisionMembership } = await import('../../../src/integrations/prisma/deleteManyDivisionMembership'));
		({ findManyUsersDivisions } = await import('../../../src/integrations/prisma/findManyUsersDivisions'));
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

	it('persists division memberships via both userId and discordUserId paths', async () => {
		const user = await createUser(standalone.prisma, {
			discordUserId: '4501',
			discordUsername: 'division-user'
		});
		const navyDivision = await createDivision(standalone.prisma, {
			code: 'NVY-T',
			name: 'Navy Test',
			kind: DivisionKind.NAVY,
			displayNamePrefix: 'NVY',
			discordRoleId: 'role-navy-test'
		});
		const staffDivision = await createDivision(standalone.prisma, {
			code: 'TECH-T',
			name: 'Tech Test',
			kind: DivisionKind.STAFF,
			displayNamePrefix: 'TECH',
			showRank: false,
			discordRoleId: 'role-tech-test'
		});

		await createManyDivisionMembership({
			userId: user.id,
			divisionIds: [navyDivision.id]
		});
		await createManyDivisionMembership({
			discordUserId: user.discordUserId,
			divisionIds: [staffDivision.id, navyDivision.id]
		});

		await expect(
			findManyUsersDivisions({
				discordUserId: user.discordUserId
			})
		).resolves.toEqual([
			expect.objectContaining({
				id: navyDivision.id,
				code: 'NVY-T'
			}),
			expect.objectContaining({
				id: staffDivision.id,
				code: 'TECH-T'
			})
		]);
	});

	it('deletes only the targeted division memberships for a Discord user', async () => {
		const user = await createUser(standalone.prisma, {
			discordUserId: '4502',
			discordUsername: 'division-user-two'
		});
		const navyDivision = await createDivision(standalone.prisma, {
			code: 'NVY-DEL',
			name: 'Navy Delete',
			kind: DivisionKind.NAVY,
			discordRoleId: 'role-navy-delete'
		});
		const supportDivision = await createDivision(standalone.prisma, {
			code: 'SUP-DEL',
			name: 'Support Delete',
			kind: DivisionKind.SUPPORT,
			discordRoleId: 'role-support-delete'
		});

		await standalone.prisma.divisionMembership.createMany({
			data: [
				{
					userId: user.id,
					divisionId: navyDivision.id
				},
				{
					userId: user.id,
					divisionId: supportDivision.id
				}
			]
		});

		await deleteManyDivisionMembership({
			discordUserId: user.discordUserId,
			divisionIds: [supportDivision.id]
		});

		await expect(
			findManyUsersDivisions({
				userId: user.id
			})
		).resolves.toEqual([
			expect.objectContaining({
				id: navyDivision.id,
				code: 'NVY-DEL'
			})
		]);
	});
});
