import { DivisionKind, EventSessionChannelKind, EventSessionState } from '@prisma/client';
import { container } from '@sapphire/framework';
import { ButtonInteraction, Guild, MessageFlags } from 'discord.js';
import {
	deleteManyEventSessionChannels,
	finalizeEventReview,
	findUniqueEventSession,
	getUserTotalMerits,
	upsertEventReviewDecision
} from '../../../../integrations/prisma';
import { ENV_DISCORD } from '../../../../config/env';
import type { ExecutionContext } from '../../../logging/executionContext';
import type { ParsedEventReviewButton } from './parseEventReviewButton';
import { syncTrackingSummaryMessage } from '../session/syncTrackingSummaryMessage';
import { syncEventReviewMessage } from './syncEventReviewMessage';
import { formatEventSessionStateLabel } from '../ui/formatEventSessionStateLabel';
import { buildUserNickname } from '../../guild-member/buildUserNickname';
import { createChildExecutionContext } from '../../../logging/executionContext';
import { notifyMeritRankUp } from '../../merit/notifyMeritRankUp';

type HandleEventReviewButtonParams = {
	interaction: ButtonInteraction;
	parsedEventReviewButton: ParsedEventReviewButton;
	context: ExecutionContext;
};

const VIEWABLE_REVIEW_STATES = new Set<EventSessionState>([
	EventSessionState.ENDED_PENDING_REVIEW,
	EventSessionState.FINALIZED_WITH_MERITS,
	EventSessionState.FINALIZED_NO_MERITS
]);

export async function handleEventReviewButton({ interaction, parsedEventReviewButton, context }: HandleEventReviewButtonParams) {
	const caller = 'handleEventReviewButton';
	const logger = context.logger.child({
		caller,
		action: parsedEventReviewButton.action,
		eventSessionId: parsedEventReviewButton.eventSessionId
	});

	try {
		const guild = await container.utilities.guild.getOrThrow().catch((error: unknown) => {
			logger.error(
				{
					err: error
				},
				'Failed to resolve configured guild while handling event review button'
			);
			return null;
		});
		if (!guild) {
			await interaction.reply({
				content: 'This action can only be used in a server.',
				ephemeral: true
			});
			return;
		}

		const member = await container.utilities.member
			.getOrThrow({
				guild,
				discordUserId: interaction.user.id
			})
			.catch(() => null);
		if (!member) {
			await interaction.reply({
				content: 'Could not resolve your member record in this server.',
				ephemeral: true
			});
			return;
		}

		const isStaff = await container.utilities.divisionRolePolicy.memberHasDivisionKindRole({
			member,
			requiredRoleKinds: [DivisionKind.STAFF]
		});
		const isCenturion = await container.utilities.divisionRolePolicy.memberHasDivision({
			member,
			divisionDiscordRoleId: ENV_DISCORD.CENT_ROLE_ID
		});
		if (!isStaff && !isCenturion) {
			await interaction.reply({
				content: 'Only staff or Centurions can perform this action.',
				ephemeral: true
			});
			return;
		}

		const eventSession = await findUniqueEventSession({
			eventSessionId: parsedEventReviewButton.eventSessionId
		});
		if (!eventSession) {
			await interaction.reply({
				content: 'Event session not found.',
				ephemeral: true
			});
			return;
		}

		if (!VIEWABLE_REVIEW_STATES.has(eventSession.state)) {
			await interaction.reply({
				content: `Event review is not available in state ${formatEventSessionStateLabel(eventSession.state)}.`,
				ephemeral: true
			});
			return;
		}

		if (parsedEventReviewButton.action === 'decision' && eventSession.state !== EventSessionState.ENDED_PENDING_REVIEW) {
			await interaction.reply({
				content: 'Review decisions are locked because this event is already finalized.',
				ephemeral: true
			});
			return;
		}

		if (parsedEventReviewButton.action === 'submit' && eventSession.state !== EventSessionState.ENDED_PENDING_REVIEW) {
			await interaction.reply({
				content: 'This event review has already been finalized.',
				ephemeral: true
			});
			return;
		}

		await interaction.deferUpdate().catch(() => null);

		if (parsedEventReviewButton.action === 'decision') {
			await upsertEventReviewDecision({
				eventSessionId: parsedEventReviewButton.eventSessionId,
				targetDbUserId: parsedEventReviewButton.targetDbUserId,
				decision: parsedEventReviewButton.decision
			});
		}

		if (parsedEventReviewButton.action === 'submit') {
			const reviewerDbUser = await container.utilities.userDirectory
				.getOrThrow({
					discordUserId: interaction.user.id
				})
				.catch(() => null);
			if (!reviewerDbUser) {
				await interaction.followUp({
					content: 'Could not resolve your database user for review finalization.',
					flags: MessageFlags.Ephemeral
				});
				return;
			}

			const finalizeResult = await finalizeEventReview({
				eventSessionId: parsedEventReviewButton.eventSessionId,
				reviewerDbUserId: reviewerDbUser.id,
				mode: parsedEventReviewButton.mode
			});
			if (!finalizeResult.finalized) {
				await interaction.followUp({
					content: 'Unable to finalize event review. It may have already been finalized by another reviewer.',
					flags: MessageFlags.Ephemeral
				});
				return;
			}

			await syncAwardedMemberNicknames({
				guild,
				awardedUsers: finalizeResult.awardedUsers,
				awardedMeritAmount: finalizeResult.awardedMeritAmount,
				context,
				logger
			});

			const finalizedSession = await findUniqueEventSession({
				eventSessionId: parsedEventReviewButton.eventSessionId,
				include: {
					hostUser: true,
					eventTier: true,
					channels: true,
					eventMessages: true
				}
			});
			if (finalizedSession) {
				await syncTrackingSummaryMessage({
					guild,
					eventSession: finalizedSession,
					logger
				});

				await postReviewSubmissionMessagesToTrackedVoiceChannels({
					guild,
					eventSession: finalizedSession,
					actorDiscordUserId: interaction.user.id,
					mode: parsedEventReviewButton.mode,
					logger
				});

				const deletedChannelRows = await deleteManyEventSessionChannels({
					eventSessionId: finalizedSession.id,
					kinds: [EventSessionChannelKind.PARENT_VC, EventSessionChannelKind.CHILD_VC]
				});

				const finalizedSessionAfterChannelCleanup = await findUniqueEventSession({
					eventSessionId: parsedEventReviewButton.eventSessionId,
					include: {
						hostUser: true,
						eventTier: true,
						channels: true,
						eventMessages: true
					}
				});
				if (finalizedSessionAfterChannelCleanup) {
					await syncTrackingSummaryMessage({
						guild,
						eventSession: finalizedSessionAfterChannelCleanup,
						logger
					});
				}

				logger.info(
					{
						eventSessionId: parsedEventReviewButton.eventSessionId,
						deletedChannelRows
					},
					'Cleaned up event session parent/child channel records after review submission'
				);
			}

			logger.info(
				{
					eventSessionId: parsedEventReviewButton.eventSessionId,
					mode: parsedEventReviewButton.mode,
					awardedCount: finalizeResult.awardedCount,
					toState: finalizeResult.toState
				},
				'Finalized event review'
			);
		}

		const synced = await syncEventReviewMessage({
			guild,
			eventSessionId: parsedEventReviewButton.eventSessionId,
			page: parsedEventReviewButton.action === 'submit' ? 1 : parsedEventReviewButton.page,
			logger
		});
		if (!synced) {
			await interaction
				.followUp({
					content: 'Could not refresh the review message. Please try again.',
					flags: MessageFlags.Ephemeral
				})
				.catch(() => null);
		}
	} catch (error) {
		logger.error(
			{
				err: error
			},
			'Failed to process event review interaction'
		);

		if (interaction.deferred || interaction.replied) {
			await interaction
				.followUp({
					content: 'Failed to process this review action.',
					flags: MessageFlags.Ephemeral
				})
				.catch(() => null);
			return;
		}

		await interaction
			.reply({
				content: 'Failed to process this review action.',
				ephemeral: true
			})
			.catch(() => null);
	}
}

async function postReviewSubmissionMessagesToTrackedVoiceChannels({
	guild,
	eventSession,
	actorDiscordUserId,
	mode,
	logger
}: {
	guild: Guild;
	eventSession: Awaited<
		ReturnType<
			typeof findUniqueEventSession<{
				hostUser: true;
				eventTier: true;
				channels: true;
				eventMessages: true;
			}>
		>
	>;
	actorDiscordUserId: string;
	mode: 'with' | 'without';
	logger: ExecutionContext['logger'];
}) {
	if (!eventSession) {
		return;
	}

	const trackedVoiceChannelIds = eventSession.channels
		.filter((channel) => channel.kind === EventSessionChannelKind.PARENT_VC || channel.kind === EventSessionChannelKind.CHILD_VC)
		.map((channel) => channel.channelId);

	const timelineChannelIds = [...new Set([eventSession.threadId, ...trackedVoiceChannelIds])];
	const timelineMessage =
		mode === 'with'
			? `Event review for **${eventSession.name}** was submitted by <@${actorDiscordUserId}> with **merits awarded**.`
			: `Event review for **${eventSession.name}** was submitted by <@${actorDiscordUserId}> with **no merits awarded**.`;

	for (const channelId of timelineChannelIds) {
		const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
		if (!channel || !('send' in channel) || typeof channel.send !== 'function') {
			logger.warn(
				{
					eventSessionId: eventSession.id,
					channelId
				},
				'Skipping post-review timeline update because channel is missing or not send-capable'
			);
			continue;
		}

		await channel.send({ content: timelineMessage }).catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					eventSessionId: eventSession.id,
					channelId
				},
				'Failed to post review-submitted update to tracked voice channel'
			);
		});
	}
}

async function syncAwardedMemberNicknames({
	guild,
	awardedUsers,
	awardedMeritAmount,
	context,
	logger
}: {
	guild: Guild;
	awardedUsers: Array<{
		dbUserId: string;
		discordUserId: string;
	}>;
	awardedMeritAmount: number;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
}) {
	if (awardedUsers.length === 0) {
		return;
	}

	for (const awardedUser of awardedUsers) {
		const discordUserId = awardedUser.discordUserId;
		const member = await container.utilities.member
			.getOrThrow({
				guild,
				discordUserId
			})
			.catch((error: unknown) => {
				logger.error(
					{
						err: error,
						discordUserId
					},
					'Failed to resolve awarded member for nickname sync'
				);
				return null;
			});
		if (!member || member.user.bot) {
			continue;
		}

		const nicknameResult = await buildUserNickname({
			discordUser: member,
			context: createChildExecutionContext({
				context,
				bindings: {
					step: 'syncAwardedMemberNickname',
					discordUserId
				}
			})
		}).catch((error: unknown) => {
			logger.error(
				{
					err: error,
					discordUserId
				},
				'Failed to build awarded member nickname after review finalization'
			);
			return {
				newUserNickname: null
			};
		});

		if (nicknameResult.newUserNickname && member.nickname !== nicknameResult.newUserNickname) {
			await member.setNickname(nicknameResult.newUserNickname, 'Event review merit rank sync').catch((error: unknown) => {
				logger.error(
					{
						err: error,
						discordUserId,
						newUserNickname: nicknameResult.newUserNickname
					},
					'Failed to set awarded member nickname after review finalization'
				);
			});
		}

		if (awardedMeritAmount > 0) {
			const currentTotalMerits = await getUserTotalMerits({
				userDbUserId: awardedUser.dbUserId
			});
			const previousTotalMerits = Math.max(0, currentTotalMerits - awardedMeritAmount);
			await notifyMeritRankUp({
				member,
				previousTotalMerits,
				currentTotalMerits,
				logger
			});
		}
	}
}
