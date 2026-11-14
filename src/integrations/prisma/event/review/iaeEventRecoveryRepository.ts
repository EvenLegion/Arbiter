import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import { upsertManyEventParticipantStats } from './upsertManyEventParticipantStats';
import {
	IAE_EVENT_ID,
	IAE_THREAD_ID,
	assertIaeRecoveryState,
	assertIaeReviewMessage,
	requireIae,
	type IaeRecoverySnapshot,
	type IaeRecoveryState,
	type IaeRecoveryLease,
	type IaeReviewMessage
} from '../../../../lib/services/event-recovery/iaeEventRecovery';

export async function readIaeEventRecoveryState(snapshot: IaeRecoverySnapshot, tx: Prisma.TransactionClient = prisma): Promise<IaeRecoveryState> {
	const [event, stats, decisions, meritCount, refs, users] = await Promise.all([
		tx.event.findUnique({ where: { id: IAE_EVENT_ID } }),
		tx.eventParticipantStat.findMany({ where: { eventSessionId: IAE_EVENT_ID }, select: { userId: true, attendedSeconds: true } }),
		tx.eventReviewDecision.findMany({ where: { eventSessionId: IAE_EVENT_ID }, select: { targetUserId: true, decision: true } }),
		tx.merit.count({ where: { eventSessionId: IAE_EVENT_ID } }),
		tx.eventMessage.findMany({ where: { eventSessionId: IAE_EVENT_ID, kind: 'REVIEW' } }),
		tx.user.findMany({ where: { id: { in: snapshot.users.map((user) => user.id) } }, select: { id: true, discordUserId: true } })
	]);
	return { event, stats, decisions, meritCount, refs, users };
}

async function lockEvent(tx: Prisma.TransactionClient, lease: IaeRecoveryLease) {
	await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${IAE_EVENT_ID} FOR UPDATE`;
	requireIae(await lease.ensureOwned(), 'operation_lease_lost');
}

export async function persistIaeSnapshot(snapshot: IaeRecoverySnapshot, lease: IaeRecoveryLease): Promise<'insert' | 'none'> {
	return prisma.$transaction(async (tx) => {
		await lockEvent(tx, lease);
		if (assertIaeRecoveryState(await readIaeEventRecoveryState(snapshot, tx), snapshot) === 'complete') return 'none';
		await upsertManyEventParticipantStats({ eventSessionId: IAE_EVENT_ID, participants: snapshot.participants }, tx);
		await tx.eventReviewDecision.createMany({
			data: snapshot.participants.map((p) => ({ eventSessionId: IAE_EVENT_ID, targetUserId: p.dbUserId, decision: 'MERIT' as const }))
		});
		requireIae(assertIaeRecoveryState(await readIaeEventRecoveryState(snapshot, tx), snapshot) === 'complete', 'persistence_verification_failed');
		requireIae(await lease.ensureOwned(), 'operation_lease_lost');
		return 'insert';
	});
}

// Keep finalization behind the event row lock until the bounded Discord send and reference write finish.
// A failed/uncertain send is never retried here; the next invocation must reconcile full thread history.
export async function persistIaeReview(
	snapshot: IaeRecoverySnapshot,
	existing: IaeReviewMessage | null,
	lease: IaeRecoveryLease,
	send: () => Promise<IaeReviewMessage>
): Promise<{ message: IaeReviewMessage; action: 'post' | 'adopt' | 'none' }> {
	const startedAt = Date.now();
	return prisma.$transaction(
		async (tx) => {
			await lockEvent(tx, lease);
			const state = await readIaeEventRecoveryState(snapshot, tx);
			requireIae(assertIaeRecoveryState(state, snapshot) === 'complete', 'attendance_not_persisted');
			if (existing) assertIaeReviewMessage(existing);
			const ref = state.refs[0];
			if (ref) {
				requireIae(existing && ref.messageId === existing.id, 'review_reference_mismatch');
				return { message: existing, action: 'none' };
			}
			requireIae(await lease.ensureOwned(), 'operation_lease_lost');
			requireIae(Date.now() - startedAt < 5_000, 'presentation_transaction_budget_exceeded');
			const message = existing ?? (await send());
			assertIaeReviewMessage(message);
			requireIae(await lease.ensureOwned(), 'operation_lease_lost');
			await tx.eventMessage.create({ data: { eventSessionId: IAE_EVENT_ID, kind: 'REVIEW', channelId: IAE_THREAD_ID, messageId: message.id } });
			return { message, action: existing ? 'adopt' : 'post' };
		},
		{ timeout: 20_000 }
	);
}
