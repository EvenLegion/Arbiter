import { type Guild, type GuildMember } from 'discord.js';

import { eventRepository, meritRepository, userRepository } from '../../../integrations/prisma/repositories';
import { findGuildMemberByInput, getGuildMemberByDiscordUserId } from '../../discord/memberDirectory';
import type { ExecutionContext } from '../../logging/executionContext';
import { computeNicknameForUser, syncNicknameForUser } from '../../services/nickname/nicknameService';
import { createGuildNicknameServiceDeps } from '../guild-member/nicknameServiceAdapters';
import { notifyMeritRankUp } from './notifyMeritRankUp';

export function createManualMeritWorkflowDeps({
	guild,
	awarderMember,
	context,
	logger
}: {
	guild: Guild;
	awarderMember: GuildMember;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
}) {
	const resolveGuildMember = async (discordUserId: string) =>
		discordUserId === awarderMember.id
			? awarderMember
			: getGuildMemberByDiscordUserId({
					guild,
					discordUserId
				});
	const nicknameServiceDeps = createGuildNicknameServiceDeps({
		guild,
		context,
		resolveMember: resolveGuildMember
	});

	return {
		resolveTargetMember: async (playerInput: string) => {
			const member = await findGuildMemberByInput({
				guild,
				input: playerInput
			});

			return member ? mapMemberToResolvedMember(member) : null;
		},
		upsertUser: userRepository.upsert,
		findLinkedEvent: async (eventSessionId: number) => {
			const linkedEvent = await eventRepository.getSession({
				eventSessionId
			});
			if (!linkedEvent) {
				return null;
			}

			return {
				id: linkedEvent.id,
				name: linkedEvent.name,
				createdAt: linkedEvent.createdAt
			};
		},
		awardManualMerit: meritRepository.awardManualMerit,
		syncRecipientNickname: async ({ discordUserId }: { discordUserId: string }) => {
			const result = await syncNicknameForUser(nicknameServiceDeps, {
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
					outcome: result.kind
				},
				'Failed to sync recipient nickname after manual merit award'
			);
			return 'failed' as const;
		},
		computeAwarderNickname: async ({ discordUserId }: { discordUserId: string }) => {
			const result = await computeNicknameForUser(nicknameServiceDeps, {
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
					awarderDiscordUserId: discordUserId
				},
				'Failed to build awarder nickname for manual merit DM'
			);
			return null;
		},
		getRecipientTotalMerits: ({ userDbUserId }: { userDbUserId: string }) =>
			meritRepository.getUserTotalMerits({
				userDbUserId
			}),
		notifyRankUp: async ({
			discordUserId,
			previousTotalMerits,
			currentTotalMerits
		}: {
			discordUserId: string;
			previousTotalMerits: number;
			currentTotalMerits: number;
		}) => {
			const member = await getGuildMemberByDiscordUserId({
				guild,
				discordUserId
			});
			if (!member) {
				return;
			}

			await notifyMeritRankUp({
				member,
				previousTotalMerits,
				currentTotalMerits,
				logger
			});
		},
		sendRecipientDm: async ({ discordUserId, content }: { discordUserId: string; content: string }) => {
			const member = await getGuildMemberByDiscordUserId({
				guild,
				discordUserId
			});
			if (!member) {
				return false;
			}

			return member.user
				.send(content)
				.then(() => true)
				.catch((error: unknown) => {
					logger.warn(
						{
							err: error,
							targetDiscordUserId: discordUserId
						},
						'Failed to DM manual merit award to recipient'
					);
					return false;
				});
		}
	};
}

export function mapMemberToResolvedMember(member: GuildMember) {
	return {
		discordUserId: member.id,
		discordUsername: member.user.username,
		discordDisplayName: member.displayName,
		discordGlobalName: member.user.globalName,
		discordAvatarUrl: member.user.displayAvatarURL(),
		isBot: member.user.bot
	};
}
