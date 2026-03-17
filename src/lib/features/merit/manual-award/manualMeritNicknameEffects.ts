import type { Guild, GuildMember } from 'discord.js';

import type { ExecutionContext } from '../../../logging/executionContext';
import { createGuildNicknameWorkflowGateway } from '../../guild-member/guildNicknameWorkflowGateway';
import { notifyMeritRankUp } from '../notifyMeritRankUp';

export function createManualMeritNicknameEffects({
	guild,
	context,
	logger,
	resolveMember
}: {
	guild: Guild;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
	resolveMember: (discordUserId: string) => Promise<GuildMember | null>;
}) {
	const nicknames = createGuildNicknameWorkflowGateway({
		guild,
		context,
		resolveMember
	});

	return {
		syncRecipientNickname: async ({ discordUserId }: { discordUserId: string }) => {
			const result = await nicknames.syncNickname({
				discordUserId,
				setReason: 'Manual merit rank sync',
				contextBindings: {
					step: 'syncRecipientNicknameAfterManualMerit'
				}
			});
			if (result.kind === 'synced') {
				return 'ok' as const;
			}
			if (result.kind === 'nickname-too-long') {
				return 'nickname-too-long' as const;
			}

			logger.warn(
				{
					targetDiscordUserId: discordUserId,
					outcome: result.kind,
					...('errorMessage' in result ? { errorMessage: result.errorMessage } : {}),
					...('errorName' in result ? { errorName: result.errorName } : {}),
					...('errorCode' in result ? { errorCode: result.errorCode } : {})
				},
				'Failed to sync recipient nickname after manual merit award'
			);
			return 'failed' as const;
		},
		computeAwarderNickname: async ({ discordUserId }: { discordUserId: string }) => {
			const result = await nicknames.computeNickname({
				discordUserId,
				contextBindings: {
					step: 'buildAwarderNicknameForManualMeritDm'
				}
			});
			if (result.kind === 'computed') {
				return result.computedNickname;
			}

			if (result.kind === 'member-not-found') {
				logger.warn(
					{
						awarderDiscordUserId: discordUserId
					},
					'Could not resolve awarder member while building manual merit DM nickname'
				);
				return null;
			}

			logger.warn(
				{
					awarderDiscordUserId: discordUserId,
					...('errorMessage' in result ? { errorMessage: result.errorMessage } : {}),
					...('errorName' in result ? { errorName: result.errorName } : {}),
					...('errorCode' in result ? { errorCode: result.errorCode } : {})
				},
				'Failed to build awarder nickname for manual merit DM'
			);
			return null;
		},
		notifyRankUp: async ({
			discordUserId,
			previousTotalMerits,
			currentTotalMerits
		}: {
			discordUserId: string;
			previousTotalMerits: number;
			currentTotalMerits: number;
		}) => {
			const member = await resolveMember(discordUserId);
			if (!member) {
				return;
			}

			await notifyMeritRankUp({
				member,
				previousTotalMerits,
				currentTotalMerits,
				logger
			});
		}
	};
}
