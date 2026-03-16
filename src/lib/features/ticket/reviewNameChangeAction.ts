import type { ButtonInteraction, Guild } from 'discord.js';

import type { InteractionResponder } from '../../discord/interactionResponder';
import type { ExecutionContext } from '../../logging/executionContext';
import { reviewNameChangeDecision } from '../../services/name-change/nameChangeService';
import { getNameChangeReviewFailureMessage, getReviewedNameChangeMetadata } from './nameChangeReviewResultPresenter';
import { createReviewNameChangeDecisionDeps, syncReviewedNameChangeThread } from './nameChangeServiceAdapters';

export async function reviewNameChangeAction({
	interaction,
	requestId,
	decision,
	guild,
	context,
	logger,
	responder,
	reviewer
}: {
	interaction: ButtonInteraction;
	requestId: number;
	decision: 'approve' | 'deny';
	guild: Guild;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
	responder: InteractionResponder;
	reviewer: {
		dbUser: { id: string } | null;
		actor: {
			discordUserId: string;
			dbUserId: string | null;
			capabilities: {
				isStaff: boolean;
				isCenturion: boolean;
			};
			discordTag?: string;
		};
	};
}) {
	await responder.deferUpdate();

	let reviewResult: Awaited<ReturnType<typeof reviewNameChangeDecision>>;
	try {
		reviewResult = await reviewNameChangeDecision(
			createReviewNameChangeDecisionDeps({
				guild,
				context,
				logger
			}),
			{
				actor: reviewer.actor,
				requestId,
				decision
			}
		);
	} catch (error) {
		logger.error(
			{
				err: error
			},
			'Failed to review name change request'
		);
		await responder.fail('Could not review this request. Please contact TECH with:', {
			requestId: true
		});
		return;
	}

	if (reviewResult.kind !== 'reviewed' && reviewResult.kind !== 'reviewed_sync_failed') {
		const failure = getNameChangeReviewFailureMessage(reviewResult);
		await responder.fail(failure.content, {
			requestId: failure.requestId ?? false
		});
		return;
	}

	const reviewed = reviewResult.reviewed;
	if (reviewResult.kind === 'reviewed_sync_failed') {
		await responder.fail('Request was reviewed, but nickname sync failed. Please contact TECH with:', {
			requestId: true
		});
		return;
	}

	const metadata = getReviewedNameChangeMetadata(reviewed.status);
	await syncReviewedNameChangeThread({
		message: interaction.message,
		channel: interaction.channel,
		channelId: interaction.channelId,
		requestId,
		requesterDiscordUserId: reviewed.requesterUser.discordUserId,
		reviewerDiscordUserId: interaction.user.id,
		reviewerTag: interaction.user.tag,
		statusLabel: metadata.reviewStatusLabel,
		decisionVerb: metadata.decisionVerb,
		logger
	});

	logger.info(
		{
			nameChangeRequestId: requestId,
			reviewerDiscordUserId: interaction.user.id,
			reviewerDbUserId: reviewer.dbUser?.id ?? null,
			status: reviewed.status,
			requesterDiscordUserId: reviewed.requesterUser.discordUserId
		},
		'Reviewed name change request'
	);
}
