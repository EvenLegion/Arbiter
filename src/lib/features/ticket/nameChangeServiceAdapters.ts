import { EmbedBuilder, type ActionRowBuilder, type ButtonBuilder, type Guild } from 'discord.js';

import { nameChangeRepository, userRepository } from '../../../integrations/prisma/repositories';
import type { ExecutionContext } from '../../logging/executionContext';
import { getNameChangeDivisionPrefixes } from './nameChangeDivisionGateway';
import { createApprovedNameChangeNicknameSync, createRequestedNicknameValidator } from './nameChangeNicknameGateway';
import { createNameChangeRequestLookupDeps as createLookupGateway } from './nameChangeServiceAdapters.shared';
import { createNameChangeReviewThreadCreator } from './nameChangeReviewThreadGateway';
import { createNameChangeRequesterGateway } from './nameChangeRequesterGateway';

export { syncEditedNameChangeThread, syncReviewedNameChangeThread } from './nameChangeReviewThreadGateway';

export function createNameChangeRequestLookupDeps() {
	return createLookupGateway();
}

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
		getDivisionPrefixes: getNameChangeDivisionPrefixes,
		getRequester: createNameChangeRequesterGateway({
			fallbackUsername
		}),
		validateRequestedNickname: createRequestedNicknameValidator({
			guild,
			context
		}),
		createRequest: async (params: { requesterDbUserId: string; currentName: string; requestedName: string; reason: string }) =>
			nameChangeRepository.createRequest(params),
		createReviewThread: createNameChangeReviewThreadCreator({
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

export function createEditPendingNameChangeRequestDeps({ guild, context }: { guild: Guild; context: ExecutionContext }) {
	return {
		getDivisionPrefixes: getNameChangeDivisionPrefixes,
		...createNameChangeRequestLookupDeps(),
		validateRequestedNickname: createRequestedNicknameValidator({
			guild,
			context
		}),
		updatePendingRequestedName: async (params: { requestId: number; requestedName: string }) =>
			nameChangeRepository.updatePendingRequestedName(params)
	};
}

export function createReviewNameChangeDecisionDeps({
	guild,
	context,
	logger
}: {
	guild: Guild;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
}) {
	return {
		...createNameChangeRequestLookupDeps(),
		validateRequestedNickname: createRequestedNicknameValidator({
			guild,
			context
		}),
		reviewRequest: nameChangeRepository.reviewRequest,
		updatePersistedNickname: async (params: { discordUserId: string; discordNickname: string }) => {
			await userRepository.updateNickname(params);
		},
		syncApprovedNickname: createApprovedNameChangeNicknameSync({
			guild,
			context,
			logger
		})
	};
}
