import type { ButtonInteraction } from 'discord.js';

import type { InteractionResponder } from '../../discord/interactionResponder';
import { getPendingNameChangeRequestForEdit } from '../../services/name-change/nameChangeService';
import { buildNameChangeReviewEditModal } from './nameChangeReviewPresenter';
import { getNameChangeEditFailureMessage } from './nameChangeReviewResultPresenter';
import { createNameChangeRequestLookupDeps } from './nameChangeServiceAdapters';

export async function openNameChangeReviewEditModal({
	interaction,
	requestId,
	reviewerActor,
	logger,
	responder
}: {
	interaction: ButtonInteraction;
	requestId: number;
	reviewerActor: {
		discordUserId: string;
		dbUserId: string | null;
		capabilities: {
			isStaff: boolean;
			isCenturion: boolean;
		};
	};
	logger: {
		error: (...values: readonly unknown[]) => void;
	};
	responder: InteractionResponder;
}) {
	let editResult: Awaited<ReturnType<typeof getPendingNameChangeRequestForEdit>>;
	try {
		editResult = await getPendingNameChangeRequestForEdit(createNameChangeRequestLookupDeps(), {
			actor: reviewerActor,
			requestId
		});
	} catch (error) {
		logger.error(
			{
				err: error
			},
			'Failed to resolve name change request before opening edit modal'
		);
		await responder.fail('Failed to open edit modal. Please try again.', {
			requestId: true
		});
		return;
	}

	if (editResult.kind !== 'editable') {
		const failure = getNameChangeEditFailureMessage(editResult);
		await responder.fail(failure.content);
		return;
	}

	const modalShown = await interaction
		.showModal(buildNameChangeReviewEditModal({ requestId: editResult.requestId, requestedName: editResult.requestedName }))
		.then(() => true)
		.catch((error: unknown) => {
			logger.error(
				{
					err: error,
					nameChangeRequestId: editResult.requestId
				},
				'Failed to show edit name modal'
			);
			return false;
		});
	if (!modalShown) {
		await responder.fail('Failed to open edit modal. Please try again.', {
			requestId: true
		});
	}
}
