import { container } from '@sapphire/framework';
import { Collection } from 'discord.js';
import { DivisionKind } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { createDivision, createUser } from '../setup/fixtures';
import { applyDatabaseTestEnv, startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';
import { createMockExecutionContext, createMockLogger } from '../../support/logger';

describe('reconcileGuildMemberDivisionMemberships integration', () => {
	let databaseUrl: string;
	let postgresContainer: Awaited<ReturnType<typeof startPostgresTestContainer>>['postgres'];
	let standalone: StandalonePrisma;
	let reconcileGuildMemberDivisionMemberships: typeof import('../../../src/lib/services/division-membership/reconcileGuildMemberDivisionMemberships').reconcileGuildMemberDivisionMemberships;
	let closeDb: typeof import('../../../src/integrations/prisma').closeDb;
	const divisionCacheGet = vi.fn();

	beforeAll(async () => {
		const { postgres, databaseUrl: nextDatabaseUrl } = await startPostgresTestContainer();
		postgresContainer = postgres;
		databaseUrl = nextDatabaseUrl;
		applyDatabaseTestEnv(databaseUrl);
		pushPrismaSchema(databaseUrl);
		standalone = createStandalonePrisma(databaseUrl);
		(container as { logger?: unknown; utilities?: unknown }).logger = createMockLogger();
		(container as { logger?: unknown; utilities?: unknown }).utilities = {
			divisionCache: {
				get: divisionCacheGet
			}
		};
		vi.resetModules();
		({ reconcileGuildMemberDivisionMemberships } =
			await import('../../../src/lib/services/division-membership/reconcileGuildMemberDivisionMemberships'));
		({ closeDb } = await import('../../../src/integrations/prisma'));
	});

	beforeEach(async () => {
		divisionCacheGet.mockReset();
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

	it('adds and removes persisted division memberships based on the member role set', async () => {
		const user = await createUser(standalone.prisma, {
			discordUserId: '4701',
			discordUsername: 'member-sync'
		});
		const navyDivision = await createDivision(standalone.prisma, {
			code: 'NVY-SYNC',
			name: 'Navy Sync',
			kind: DivisionKind.NAVY,
			discordRoleId: 'role-navy-sync'
		});
		const supportDivision = await createDivision(standalone.prisma, {
			code: 'SUP-SYNC',
			name: 'Support Sync',
			kind: DivisionKind.SUPPORT,
			discordRoleId: 'role-support-sync'
		});
		const reserveDivision = await createDivision(standalone.prisma, {
			code: 'RES-SYNC',
			name: 'Reserve Sync',
			kind: DivisionKind.RESERVE,
			discordRoleId: 'role-reserve-sync'
		});
		await standalone.prisma.divisionMembership.create({
			data: {
				userId: user.id,
				divisionId: supportDivision.id
			}
		});
		divisionCacheGet.mockResolvedValue([navyDivision, supportDivision, reserveDivision]);

		await reconcileGuildMemberDivisionMemberships({
			discordUser: {
				id: user.discordUserId,
				nickname: user.discordNickname,
				user: {
					username: user.discordUsername
				},
				roles: {
					cache: new Collection([
						['role-navy-sync', { id: 'role-navy-sync' }],
						['role-reserve-sync', { id: 'role-reserve-sync' }]
					])
				}
			} as never,
			context: createMockExecutionContext()
		});

		await expect(
			standalone.prisma.divisionMembership.findMany({
				where: {
					userId: user.id
				},
				orderBy: {
					divisionId: 'asc'
				},
				include: {
					division: true
				}
			})
		).resolves.toEqual([
			expect.objectContaining({
				divisionId: navyDivision.id,
				division: expect.objectContaining({
					code: 'NVY-SYNC'
				})
			}),
			expect.objectContaining({
				divisionId: reserveDivision.id,
				division: expect.objectContaining({
					code: 'RES-SYNC'
				})
			})
		]);
	});
});
