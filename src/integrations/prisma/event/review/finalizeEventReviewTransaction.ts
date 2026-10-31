import { EventReviewDecisionKind, EventSessionState } from '@prisma/client';

import { MeritEligibilityError, type ResolveMeritEligibility } from '../../../../lib/services/merit-eligibility/meritEligibility';
import {
	buildFinalizedWithoutMeritsResult,
	buildUnfinalizedEventReviewResult,
	createFinalizedEventReviewMerits,
	findMeritDecisionRows,
	findDefaultReviewDecisionRows,
	finalizeEventReviewState,
	loadCenturionHostMeritType,
	loadFinalizableEventReviewSession
} from './finalizeEventReviewTransactionHelpers';
import { prisma } from '../../prisma';

export type { FinalizeEventReviewResult } from './finalizeEventReviewTransactionHelpers';
import type { FinalizeEventReviewResult } from './finalizeEventReviewTransactionHelpers';

export async function finalizeEventReviewTransaction({
	eventSessionId,
	reviewerDbUserId,
	mode,
	resolveMeritEligibility
}: {
	eventSessionId: number;
	reviewerDbUserId: string;
	mode: 'with' | 'without';
	resolveMeritEligibility: ResolveMeritEligibility;
}): Promise<FinalizeEventReviewResult> {
	const toState: FinalizeEventReviewResult['toState'] =
		mode === 'with' ? EventSessionState.FINALIZED_WITH_MERITS : EventSessionState.FINALIZED_NO_MERITS;

	const now = new Date();

	// Resolve live Discord roles before opening the DB transaction: rate-limited
	// member fetches must not hold the event lock or exhaust Prisma's timeout.
	const eligibility = new Map<string, Awaited<ReturnType<ResolveMeritEligibility>>>();
	if (mode === 'with') {
		const candidateSession = await loadFinalizableEventReviewSession(prisma, eventSessionId);
		if (!candidateSession || candidateSession.state !== EventSessionState.ENDED_PENDING_REVIEW) return buildUnfinalizedEventReviewResult(toState);
		const defaults = await findDefaultReviewDecisionRows(prisma, candidateSession);
		const candidates = [
			...(await findMeritDecisionRows(prisma, eventSessionId)),
			...defaults.filter((row) => row.decision === EventReviewDecisionKind.MERIT)
		];
		for (const discordUserId of new Set([...candidates.map((row) => row.targetUser.discordUserId), candidateSession.hostUser.discordUserId])) {
			eligibility.set(discordUserId, await resolveMeritEligibility(discordUserId));
		}
		if ([...eligibility.values()].some((status) => status === 'unavailable')) throw new MeritEligibilityError('unavailable');
	}

	return prisma.$transaction(async (tx) => {
		const eventSession = await loadFinalizableEventReviewSession(tx, eventSessionId);

		if (!eventSession || eventSession.state !== EventSessionState.ENDED_PENDING_REVIEW) {
			return buildUnfinalizedEventReviewResult(toState);
		}

		const updated = await finalizeEventReviewState({
			tx,
			eventSessionId,
			toState,
			reviewerDbUserId,
			now
		});
		if (updated.count !== 1) {
			return buildUnfinalizedEventReviewResult(toState);
		}

		if (mode !== 'with') {
			return buildFinalizedWithoutMeritsResult(toState);
		}

		const defaults = await findDefaultReviewDecisionRows(tx, eventSession);
		const meritDecisionRows = [
			...(await findMeritDecisionRows(tx, eventSessionId)),
			...defaults.filter((row) => row.decision === EventReviewDecisionKind.MERIT)
		];

		// Re-read decisions under the finalization transaction. A concurrent new selection
		// must be checked on a retry rather than inheriting another user's eligibility.
		if (
			[...meritDecisionRows.map((row) => row.targetUser.discordUserId), eventSession.hostUser.discordUserId].some(
				(discordUserId) => !eligibility.has(discordUserId)
			)
		) {
			throw new MeritEligibilityError('unavailable');
		}
		if (defaults.length > 0) {
			await tx.eventReviewDecision.createMany({
				data: defaults.map((row) => ({
					eventSessionId,
					targetUserId: row.targetUserId,
					decision:
						row.decision === EventReviewDecisionKind.MERIT && eligibility.get(row.targetUser.discordUserId) === 'eligible'
							? EventReviewDecisionKind.MERIT
							: EventReviewDecisionKind.NO_MERIT
				})),
				skipDuplicates: true
			});
		}
		const eligibleDecisionRows = meritDecisionRows.filter((row) => eligibility.get(row.targetUser.discordUserId) === 'eligible');
		const ineligibleUserIds = meritDecisionRows
			.filter((row) => eligibility.get(row.targetUser.discordUserId) !== 'eligible')
			.map((row) => row.targetUserId);
		if (ineligibleUserIds.length > 0) {
			await tx.eventReviewDecision.updateMany({
				where: { eventSessionId, targetUserId: { in: ineligibleUserIds } },
				data: { decision: 'NO_MERIT' }
			});
		}

		const centurionHostMeritType = await loadCenturionHostMeritType(tx);
		const meritCreation = await createFinalizedEventReviewMerits({
			tx,
			meritDecisionRows: eligibleDecisionRows,
			hostEligible: eligibility.get(eventSession.hostUser.discordUserId) === 'eligible',
			reviewerDbUserId,
			eventSessionId,
			attendanceMeritTypeId: eventSession.eventTier.meritTypeId,
			attendanceMeritAmount: eventSession.eventTier.meritType.meritAmount,
			hostUserId: eventSession.hostUserId,
			hostDiscordUserId: eventSession.hostUser.discordUserId,
			hostMeritTypeId: centurionHostMeritType.id,
			hostMeritAmount: centurionHostMeritType.meritAmount
		});

		return {
			finalized: true,
			toState,
			awardedCount: meritCreation.createManyResult.count,
			awardedUsers: meritCreation.awardedUsers
		};
	});
}
