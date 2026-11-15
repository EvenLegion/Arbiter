import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { createEventSession, createUser } from '../setup/fixtures';
import { applyDatabaseTestEnv, startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';
import { IAE_THREAD_ID, type IaeRecoverySnapshot } from '../../../src/lib/services/event-recovery/iaeEventRecovery';

describe('incident 1011 guarded recovery repository', () => {
	let container: Awaited<ReturnType<typeof startPostgresTestContainer>>['postgres'];
	let db: StandalonePrisma;
	let repository: typeof import('../../../src/integrations/prisma/event/review/iaeEventRecoveryRepository');
	let closeDb: () => Promise<void>;
	let snapshot: IaeRecoverySnapshot;
	const lease = { ensureOwned: async () => true, release: async () => {} };
	beforeAll(async () => {
		const started = await startPostgresTestContainer();
		container = started.postgres;
		applyDatabaseTestEnv(started.databaseUrl);
		pushPrismaSchema(started.databaseUrl);
		db = createStandalonePrisma(started.databaseUrl);
		vi.resetModules();
		repository = await import('../../../src/integrations/prisma/event/review/iaeEventRecoveryRepository');
		({ closeDb } = await import('../../../src/integrations/prisma/prisma'));
	});
	beforeEach(async () => {
		await resetDatabase(db.prisma);
		await seedReferenceData(db.prisma);
		const users = await Promise.all(
			Array.from({ length: 75 }, (_, i) => createUser(db.prisma, { discordUserId: String(100000000000000000n + BigInt(i)) }))
		);
		const created = await createEventSession(db.prisma, {
			hostUserId: users[0]!.id,
			threadId: IAE_THREAD_ID,
			name: '🔴 IAE LAUNCH DAY',
			state: 'ENDED_PENDING_REVIEW'
		});
		const event = await db.prisma.event.update({
			where: { id: created.id },
			data: {
				id: 1011,
				startedAt: new Date('2026-11-14T00:17:02.898Z'),
				endedAt: new Date('2026-11-14T00:25:27.703Z'),
				expectedEventDuration: 90
			}
		});
		const attendance = users.map((user, i) => ({ discordUserId: user.discordUserId, attendedSeconds: i < 72 ? 480 : [420, 360, 300][i - 72]! }));
		snapshot = {
			event,
			guildId: '123',
			metadata: {},
			users: users.map(({ id, discordUserId }) => ({ id, discordUserId })),
			attendance,
			participants: users.map((user, i) => ({ dbUserId: user.id, attendedSeconds: attendance[i]!.attendedSeconds }))
		};
	});
	afterAll(async () => {
		if (closeDb) await closeDb();
		if (db) await db.close();
		if (container) await stopPostgresTestContainer(container);
	});
	it('persists 75 exactly, retries without changes, and adopts a message only once without awarding', async () => {
		expect(await repository.persistIaeSnapshot(snapshot, lease)).toBe('insert');
		const initial = await repository.readIaeEventRecoveryState(snapshot);
		expect(initial.stats).toHaveLength(75);
		expect(initial.decisions).toHaveLength(75);
		expect(initial.meritCount).toBe(0);
		expect(await repository.persistIaeSnapshot(snapshot, lease)).toBe('none');
		expect(await repository.readIaeEventRecoveryState(snapshot)).toEqual(initial);
		const message = { id: '123456789', channelId: IAE_THREAD_ID, attendeeCount: 75 };
		const send = vi.fn();
		expect((await repository.persistIaeReview(snapshot, message, lease, send)).action).toBe('adopt');
		expect((await repository.persistIaeReview(snapshot, message, lease, send)).action).toBe('none');
		expect(send).not.toHaveBeenCalled();
		expect(await db.prisma.eventMessage.count({ where: { kind: 'REVIEW' } })).toBe(1);
		expect(await db.prisma.merit.count()).toBe(0);
	});
	it('rolls back stats when decision write fails, using the same transaction', async () => {
		await db.prisma.$executeRawUnsafe(`ALTER TABLE "EventReviewDecision" ADD CONSTRAINT iae_test_reject CHECK ("eventSessionId" <> 1011)`);
		try {
			await expect(repository.persistIaeSnapshot(snapshot, lease)).rejects.toThrow();
		} finally {
			await db.prisma.$executeRawUnsafe('ALTER TABLE "EventReviewDecision" DROP CONSTRAINT iae_test_reject');
		}
		expect(await db.prisma.eventParticipantStat.count()).toBe(0);
		expect(await db.prisma.eventReviewDecision.count()).toBe(0);
	});
	it('refuses partial, finalized, and lost-lease states without filling gaps', async () => {
		await db.prisma.eventParticipantStat.create({ data: { eventSessionId: 1011, userId: snapshot.users[0]!.id, attendedSeconds: 480 } });
		await expect(repository.persistIaeSnapshot(snapshot, lease)).rejects.toThrow();
		expect(await db.prisma.eventParticipantStat.count()).toBe(1);
		expect(await db.prisma.eventReviewDecision.count()).toBe(0);
		await db.prisma.eventParticipantStat.deleteMany();
		await db.prisma.event.update({ where: { id: 1011 }, data: { state: 'FINALIZED_NO_MERITS' } });
		await expect(repository.persistIaeSnapshot(snapshot, lease)).rejects.toThrow();
		await expect(repository.persistIaeSnapshot(snapshot, { ...lease, ensureOwned: async () => false })).rejects.toThrow();
		expect(await db.prisma.eventParticipantStat.count()).toBe(0);
	});
	it('does not retry a failed send or leave a message reference', async () => {
		await repository.persistIaeSnapshot(snapshot, lease);
		const send = vi.fn().mockRejectedValue(new Error('uncertain send'));
		await expect(repository.persistIaeReview(snapshot, null, lease, send)).rejects.toThrow('uncertain send');
		expect(send).toHaveBeenCalledTimes(1);
		expect(await db.prisma.eventMessage.count({ where: { kind: 'REVIEW' } })).toBe(0);
		expect(await db.prisma.eventParticipantStat.count()).toBe(75);
		expect(await db.prisma.merit.count()).toBe(0);
	});
});
