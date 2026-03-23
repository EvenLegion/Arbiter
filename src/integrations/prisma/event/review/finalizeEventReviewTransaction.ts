import { EventSessionState } from '@prisma/client';

import {
	buildFinalizedWithoutMeritsResult,
	buildUnfinalizedEventReviewResult,
	createFinalizedEventReviewMerits,
	findMeritDecisionRows,
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
	mode
}: {
	eventSessionId: number;
	reviewerDbUserId: string;
	mode: 'with' | 'without';
}): Promise<FinalizeEventReviewResult> {
	const toState: FinalizeEventReviewResult['toState'] =
		mode === 'with' ? EventSessionState.FINALIZED_WITH_MERITS : EventSessionState.FINALIZED_NO_MERITS;

	const now = new Date();

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

		const meritDecisionRows = await findMeritDecisionRows(tx, eventSessionId);

		if (meritDecisionRows.length === 0) {
			const centurionHostMeritType = await loadCenturionHostMeritType(tx);
			const hostMeritCreation = await createFinalizedEventReviewMerits({
				tx,
				meritDecisionRows,
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
				awardedCount: hostMeritCreation.createManyResult.count,
				awardedUsers: hostMeritCreation.awardedUsers
			};
		}

		const centurionHostMeritType = await loadCenturionHostMeritType(tx);
		const meritCreation = await createFinalizedEventReviewMerits({
			tx,
			meritDecisionRows,
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
