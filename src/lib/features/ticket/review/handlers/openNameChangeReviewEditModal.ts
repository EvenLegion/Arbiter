import type { ButtonInteraction } from 'discord.js';

import { nameChangeRepository } from '../../../../../integrations/prisma/repositories';
import type { InteractionResponder } from '../../../../discord/interactions/interactionResponder';
import { getPendingNameChangeRequestForEdit } from '../../../../services/name-change/nameChangeService';
import { buildNameChangeReviewEditModal } from '../presentation/nameChangeReviewPresentation';
import { getNameChangeEditFailureMessage } from '../presentation/nameChangeReviewResultPresenter';

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
		info: (...values: readonly unknown[]) => void;
		error: (...values: readonly unknown[]) => void;
	};
	responder: InteractionResponder;
}) {
	logger.info(
		{
			nameChangeRequestId: requestId,
			reviewerDiscordUserId: reviewerActor.discordUserId
		},
		'name_change.edit_modal.started'
	);

	let editResult: Awaited<ReturnType<typeof getPendingNameChangeRequestForEdit>>;
	try {
		editResult = await getPendingNameChangeRequestForEdit(
			{
				findRequest: nameChangeRepository.getRequest
			},
			{
				actor: reviewerActor,
				requestId
			}
		);
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
		logger.info(
			{
				nameChangeRequestId: requestId,
				reviewerDiscordUserId: reviewerActor.discordUserId,
				resultKind: editResult.kind
			},
			'name_change.edit_modal.rejected'
		);
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
		return;
	}

	logger.info(
		{
			nameChangeRequestId: editResult.requestId,
			reviewerDiscordUserId: reviewerActor.discordUserId
		},
		'name_change.edit_modal.opened'
	);
}
