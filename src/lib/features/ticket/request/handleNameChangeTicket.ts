import { type ChatInputCommandInteraction } from 'discord.js';

import { nameChangeRepository } from '../../../../integrations/prisma/repositories';
import { getDbUser } from '../../../discord/guild/users';
import { prepareGuildInteraction } from '../../../discord/interactions/prepareGuildInteraction';
import { createInteractionResponder } from '../../../discord/interactions/interactionResponder';
import type { ExecutionContext } from '../../../logging/executionContext';
import { submitNameChangeRequest } from '../../../services/name-change/nameChangeService';
import { createRequestedNicknameValidator, listNameChangeDivisionPrefixes } from '../nameChangeWorkflowSupport';
import { buildNameChangeReviewActionRow } from '../review/presentation/nameChangeReviewPresentation';
import { createNameChangeReviewThread } from '../thread/createNameChangeReviewThread';
import { buildInitialNameChangeReviewEmbed } from './buildInitialNameChangeReviewEmbed';
import { presentNameChangeTicketResult } from './presentNameChangeTicketResult';

type HandleNameChangeTicketParams = {
	interaction: ChatInputCommandInteraction;
	context: ExecutionContext;
};

export async function handleNameChangeTicket({ interaction, context }: HandleNameChangeTicketParams) {
	const caller = 'handleNameChangeTicket';
	const logger = context.logger.child({ caller });
	const initialResponder = createInteractionResponder({
		interaction,
		context,
		logger,
		caller
	});

	const rawRequestedName = interaction.options.getString('requested_name', true).trim();
	const reason = interaction.options.getString('reason', true).trim();
	logger.info(
		{
			requesterDiscordUserId: interaction.user.id,
			rawRequestedName,
			reasonLength: reason.length
		},
		'name_change.request.started'
	);
	if (!rawRequestedName || !reason) {
		logger.info(
			{
				requesterDiscordUserId: interaction.user.id,
				hasRequestedName: rawRequestedName.length > 0,
				hasReason: reason.length > 0
			},
			'name_change.request.rejected'
		);
		await initialResponder.fail('Requested name and reason are required.');
		return;
	}

	const prepared = await prepareGuildInteraction({
		interaction,
		context,
		caller,
		guildLogMessage: 'Failed to resolve configured guild while handling name change ticket',
		guildFailureMessage: 'Could not resolve configured guild. Please contact TECH with:',
		requestId: true,
		defer: 'ephemeralReply'
	});
	if (!prepared) {
		return;
	}
	const { guild, responder } = prepared;

	let result: Awaited<ReturnType<typeof submitNameChangeRequest>>;
	try {
		result = await submitNameChangeRequest(
			{
				getDivisionPrefixes: listNameChangeDivisionPrefixes,
				getRequester: async (discordUserId: string) => {
					const requesterDbUser = await getDbUser({ discordUserId });
					if (!requesterDbUser) {
						return null;
					}

					return {
						dbUserId: requesterDbUser.id,
						currentName: requesterDbUser.discordNickname || requesterDbUser.discordUsername || interaction.user.username
					};
				},
				validateRequestedNickname: createRequestedNicknameValidator({
					guild,
					context
				}),
				createRequest: async (params: { requesterDbUserId: string; currentName: string; requestedName: string; reason: string }) =>
					nameChangeRepository.createRequest(params),
				createReviewThread: createNameChangeReviewThread({
					guild,
					logger,
					buildReviewEmbed: buildInitialNameChangeReviewEmbed,
					buildReviewActionRow: buildNameChangeReviewActionRow
				}),
				saveReviewThreadReference: async (params: { requestId: number; reviewThreadId: string }) => {
					await nameChangeRepository.saveReviewThreadReference({
						requestId: params.requestId,
						reviewThreadId: params.reviewThreadId
					});
				}
			},
			{
				actor: {
					discordUserId: interaction.user.id,
					dbUserId: null,
					capabilities: {
						isStaff: false,
						isCenturion: false
					}
				},
				rawRequestedName,
				reason,
				requesterTag: interaction.user.tag
			}
		);
	} catch (error) {
		logger.error(
			{
				err: error,
				discordUserId: interaction.user.id
			},
			'Failed to submit name change request'
		);
		await responder.fail('Failed to create name change request. Please contact staff with:', {
			requestId: true
		});
		return;
	}

	const response = presentNameChangeTicketResult(result);
	if (response.delivery === 'fail') {
		const logBindings = {
			requesterDiscordUserId: interaction.user.id,
			rawRequestedName,
			resultKind: result.kind,
			...('requestId' in result ? { nameChangeRequestId: result.requestId } : {})
		};
		if (
			result.kind === 'requester_not_found' ||
			result.kind === 'requester_member_not_found' ||
			result.kind === 'validation_failed' ||
			result.kind === 'request_creation_failed' ||
			result.kind === 'review_thread_failed' ||
			result.kind === 'review_thread_reference_failed'
		) {
			logger.error(
				{
					...logBindings,
					result
				},
				'name_change.request.failed'
			);
		} else {
			logger.info(logBindings, 'name_change.request.rejected');
		}
		await responder.fail(response.content, {
			requestId: response.requestId
		});
		return;
	}

	if (result.kind === 'created' && result.strippedDivisionPrefix) {
		logger.info(
			{
				rawRequestedName,
				normalizedRequestedName: result.requestedName,
				strippedDivisionPrefix: result.strippedDivisionPrefix
			},
			'name_change.request.normalized'
		);
	}

	if (result.kind === 'created') {
		logger.info(
			{
				nameChangeRequestId: result.requestId,
				requesterDiscordUserId: interaction.user.id,
				requestedName: result.requestedName,
				reviewThreadId: result.reviewThreadId
			},
			'name_change.request.submitted'
		);
	}

	await responder.safeEditReply({
		content: response.content
	});
}
