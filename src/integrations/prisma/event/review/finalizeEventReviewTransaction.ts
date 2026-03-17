import { EventSessionState } from '@prisma/client';

import {
	buildFinalizedWithoutMeritsResult,
	buildUnfinalizedEventReviewResult,
	createFinalizedEventReviewMerits,
	findMeritDecisionRows,
	finalizeEventReviewState,
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
			return buildFinalizedWithoutMeritsResult(toState);
		}

		const createManyResult = await createFinalizedEventReviewMerits({
			tx,
			meritDecisionRows,
			reviewerDbUserId,
			eventSessionId,
			meritTypeId: eventSession.eventTier.meritTypeId
		});

		return {
			finalized: true,
			toState,
			awardedCount: createManyResult.count,
			awardedMeritAmount: eventSession.eventTier.meritType.meritAmount,
			awardedUsers: meritDecisionRows.map((row) => ({
				dbUserId: row.targetUserId,
				discordUserId: row.targetUser.discordUserId
			}))
		};
	});
}
