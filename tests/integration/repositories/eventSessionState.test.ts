import { EventSessionState, MeritTypeCode } from '@prisma/client';
import { ZodError } from 'zod';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { createEventSession, createUser } from '../setup/fixtures';
import { applyDatabaseTestEnv, startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';

describe('event session state integration', () => {
	let databaseUrl: string;
	let postgresContainer: Awaited<ReturnType<typeof startPostgresTestContainer>>['postgres'];
	let standalone: StandalonePrisma;
	let eventRepository: typeof import('../../../src/integrations/prisma/repositories').eventRepository;
	let closeDb: typeof import('../../../src/integrations/prisma').closeDb;

	beforeAll(async () => {
		const { postgres, databaseUrl: nextDatabaseUrl } = await startPostgresTestContainer();
		postgresContainer = postgres;
		databaseUrl = nextDatabaseUrl;
		applyDatabaseTestEnv(databaseUrl);
		pushPrismaSchema(databaseUrl);
		standalone = createStandalonePrisma(databaseUrl);
		vi.resetModules();
		({ eventRepository } = await import('../../../src/integrations/prisma/repositories'));
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

	it('creates a draft event and persists valid state transitions through finalization', async () => {
		const hostUser = await createUser(standalone.prisma, {
			discordUserId: '4201',
			discordUsername: 'event-host'
		});
		const reviewerUser = await createUser(standalone.prisma, {
			discordUserId: '4202',
			discordUsername: 'event-reviewer'
		});

		const draft = await eventRepository.createDraftSession({
			hostDbUserId: hostUser.id,
			eventTierId: (
				await standalone.prisma.eventTier.findUniqueOrThrow({
					where: {
						code: MeritTypeCode.TIER_2
					}
				})
			).id,
			threadId: 'thread-4201',
			name: 'Stateful Op',
			primaryChannelId: 'voice-4201',
			addedByDbUserId: hostUser.id
		});

		expect(draft.state).toBe(EventSessionState.DRAFT);
		expect(draft.channels).toHaveLength(1);

		const startedAt = new Date('2026-03-14T18:00:00.000Z');
		expect(
			await eventRepository.updateSessionState({
				eventSessionId: draft.id,
				fromState: EventSessionState.DRAFT,
				toState: EventSessionState.ACTIVE,
				data: {
					startedAt
				}
			})
		).toBe(true);

		const endedAt = new Date('2026-03-14T19:00:00.000Z');
		expect(
			await eventRepository.updateSessionState({
				eventSessionId: draft.id,
				fromState: EventSessionState.ACTIVE,
				toState: EventSessionState.ENDED_PENDING_REVIEW,
				data: {
					endedAt
				}
			})
		).toBe(true);

		const finalizedAt = new Date('2026-03-14T19:15:00.000Z');
		expect(
			await eventRepository.updateSessionState({
				eventSessionId: draft.id,
				fromState: EventSessionState.ENDED_PENDING_REVIEW,
				toState: EventSessionState.FINALIZED_WITH_MERITS,
				data: {
					reviewFinalizedAt: finalizedAt,
					reviewFinalizedByUserId: reviewerUser.id
				}
			})
		).toBe(true);

		await expect(
			eventRepository.getSession({
				eventSessionId: draft.id
			})
		).resolves.toMatchObject({
			id: draft.id,
			state: EventSessionState.FINALIZED_WITH_MERITS,
			startedAt,
			endedAt,
			reviewFinalizedAt: finalizedAt,
			reviewFinalizedByUserId: reviewerUser.id
		});
	});

	it('returns false when the persisted fromState no longer matches', async () => {
		const hostUser = await createUser(standalone.prisma, {
			discordUserId: '4203',
			discordUsername: 'event-host-two'
		});
		const eventSession = await createEventSession(standalone.prisma, {
			hostUserId: hostUser.id,
			threadId: 'thread-4203',
			name: 'Already Active',
			state: EventSessionState.ACTIVE,
			eventTierCode: MeritTypeCode.TIER_1
		});

		await expect(
			eventRepository.updateSessionState({
				eventSessionId: eventSession.id,
				fromState: EventSessionState.DRAFT,
				toState: EventSessionState.ACTIVE,
				data: {
					startedAt: new Date('2026-03-14T20:00:00.000Z')
				}
			})
		).resolves.toBe(false);
	});

	it('rejects invalid transition shapes before touching the database', async () => {
		const hostUser = await createUser(standalone.prisma, {
			discordUserId: '4204',
			discordUsername: 'event-host-three'
		});
		const eventSession = await createEventSession(standalone.prisma, {
			hostUserId: hostUser.id,
			threadId: 'thread-4204',
			name: 'Invalid Transition',
			state: EventSessionState.DRAFT,
			eventTierCode: MeritTypeCode.TIER_3
		});

		await expect(
			eventRepository.updateSessionState({
				eventSessionId: eventSession.id,
				fromState: EventSessionState.DRAFT,
				toState: EventSessionState.FINALIZED_NO_MERITS,
				data: {
					reviewFinalizedAt: new Date('2026-03-14T21:00:00.000Z'),
					reviewFinalizedByUserId: hostUser.id
				}
			})
		).rejects.toBeInstanceOf(ZodError);

		await expect(
			eventRepository.getSession({
				eventSessionId: eventSession.id
			})
		).resolves.toMatchObject({
			state: EventSessionState.DRAFT,
			reviewFinalizedAt: null,
			reviewFinalizedByUserId: null
		});
	});
});
