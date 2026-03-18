import { type ActionRowBuilder, type ButtonBuilder, type EmbedBuilder, type Guild } from 'discord.js';

import { nameChangeRepository } from '../../../../integrations/prisma/repositories';
import { getDbUser } from '../../../discord/guild/users';
import type { ExecutionContext } from '../../../logging/executionContext';
import { createNameChangeReviewThread } from '../thread/createNameChangeReviewThread';
import { createRequestedNicknameValidator, listNameChangeDivisionPrefixes } from '../nameChangeWorkflowSupport';

export function createSubmitNameChangeRequestDeps({
	guild,
	context,
	fallbackUsername,
	buildReviewEmbed,
	buildReviewActionRow
}: {
	guild: Guild;
	context: ExecutionContext;
	fallbackUsername: string;
	buildReviewEmbed: (params: {
		requestId: number;
		requesterDiscordUserId: string;
		currentName: string;
		requestedName: string;
		reason: string;
	}) => EmbedBuilder;
	buildReviewActionRow: (params: { requestId: number }) => ActionRowBuilder<ButtonBuilder>;
}) {
	return {
		getDivisionPrefixes: listNameChangeDivisionPrefixes,
		getRequester: async (discordUserId: string) => {
			const requesterDbUser = await getDbUser({ discordUserId });
			if (!requesterDbUser) {
				return null;
			}

			return {
				dbUserId: requesterDbUser.id,
				currentName: requesterDbUser.discordNickname || requesterDbUser.discordUsername || fallbackUsername
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
			buildReviewEmbed,
			buildReviewActionRow
		}),
		saveReviewThreadReference: async (params: { requestId: number; reviewThreadId: string }) => {
			await nameChangeRepository.saveReviewThreadReference({
				requestId: params.requestId,
				reviewThreadId: params.reviewThreadId
			});
		}
	};
}
