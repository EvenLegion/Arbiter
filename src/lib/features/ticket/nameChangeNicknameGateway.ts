import type { Guild } from 'discord.js';

import type { ExecutionContext } from '../../logging/executionContext';
import type { ReviewedNameChangeRequest } from '../../services/name-change/nameChangeService';
import { syncNicknameForUser, validateRequestedNickname } from '../../services/nickname/nicknameService';
import { createGuildNicknameServiceDeps } from '../guild-member/nicknameServiceAdapters';

export function createRequestedNicknameValidator({ guild, context }: { guild: Guild; context: ExecutionContext }) {
	const nicknameServiceDeps = createGuildNicknameServiceDeps({
		guild,
		context
	});

	return (params: { discordUserId: string; requestedName: string }) =>
		validateRequestedNickname(nicknameServiceDeps, {
			discordUserId: params.discordUserId,
			requestedName: params.requestedName
		});
}

export function createApprovedNameChangeNicknameSync({
	guild,
	context,
	logger
}: {
	guild: Guild;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
}) {
	return async (reviewed: ReviewedNameChangeRequest) => {
		if (reviewed.status !== 'APPROVED') {
			return;
		}

		const nicknameSyncResult = await syncNicknameForUser(
			createGuildNicknameServiceDeps({
				guild,
				context
			}),
			{
				discordUserId: reviewed.requesterUser.discordUserId,
				setReason: 'Approved name change request',
				contextBindings: {
					step: 'buildUserNicknameForApprovedNameChange'
				}
			}
		);
		if (nicknameSyncResult.kind !== 'synced') {
			throw new Error(`Failed to sync approved name change nickname: ${nicknameSyncResult.kind}`);
		}

		logger.info(
			{
				requesterDiscordUserId: reviewed.requesterUser.discordUserId,
				requestedName: reviewed.requestedName,
				updatedNickname: nicknameSyncResult.member.displayName,
				nicknameSyncOutcome: nicknameSyncResult.outcome,
				nicknameSyncSkipReason: nicknameSyncResult.outcome === 'skipped' ? nicknameSyncResult.reason : undefined
			},
			'Applied approved name change request nickname sync'
		);
	};
}
