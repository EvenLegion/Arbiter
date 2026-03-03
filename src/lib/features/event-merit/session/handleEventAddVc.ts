import { EventSessionChannelKind, EventSessionState } from '@prisma/client';
import { container } from '@sapphire/framework';
import { MessageFlags, type VoiceBasedChannel } from 'discord.js';
import { z } from 'zod';
import { findReservedEventVoiceChannelReservation, findUniqueEventSession, upsertEventSessionChannel } from '../../../../integrations/prisma';
import type { ExecutionContext } from '../../../logging/executionContext';
import { syncTrackingSummaryMessage } from './syncTrackingSummaryMessage';

type HandleEventAddVcParams = {
	interaction: import('@sapphire/plugin-subcommands').Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
};

const EVENT_SESSION_ID_SCHEMA = z.coerce.number().int().positive();
const ADD_VC_ALLOWED_EVENT_STATES = new Set<EventSessionState>([EventSessionState.DRAFT, EventSessionState.ACTIVE]);

export async function handleEventAddVc({ interaction, context }: HandleEventAddVcParams) {
	const caller = 'handleEventAddVc';
	const logger = context.logger.child({ caller });

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	if (!interaction.inGuild() || !interaction.guild) {
		await interaction.editReply({
			content: 'This command can only be used in a server.'
		});
		return;
	}

	const requestedVoiceChannelId = interaction.options.getString('voice_channel')?.trim() ?? '';
	let targetVoiceChannelId: string | null = null;
	let targetVoiceChannel: VoiceBasedChannel | null = null;

	// If a voice channel was provided, use it, otherwise use the user's current voice channel.
	if (requestedVoiceChannelId.length > 0) {
		targetVoiceChannel = await container.utilities.guild
			.getVoiceBasedChannelOrThrow({
				guild: interaction.guild,
				channelId: requestedVoiceChannelId
			})
			.catch(() => null);
		if (!targetVoiceChannel) {
			await interaction.editReply({
				content: 'Selected `voice_channel` was not found or is not voice-based.'
			});
			return;
		}

		targetVoiceChannelId = targetVoiceChannel.id;
	} else {
		const member = await container.utilities.member
			.getOrThrow({
				guild: interaction.guild,
				discordUserId: interaction.user.id
			})
			.catch(() => null);
		if (!member) {
			await interaction.editReply({
				content: 'Could not resolve your member record in this server.'
			});
			return;
		}

		if (!member.voice.channelId || !member.voice.channel || !member.voice.channel.isVoiceBased()) {
			await interaction.editReply({
				content: 'You must be in a voice channel or provide `voice_channel`.'
			});
			return;
		}

		targetVoiceChannelId = member.voice.channelId;
		targetVoiceChannel = member.voice.channel;
	}

	const rawEventSessionId = interaction.options.getString('event_selection', true);
	const parsedEventSessionId = EVENT_SESSION_ID_SCHEMA.safeParse(rawEventSessionId);
	if (!parsedEventSessionId.success) {
		await interaction.editReply({
			content: 'Invalid event selection.'
		});
		return;
	}

	const eventSession = await findUniqueEventSession({
		eventSessionId: parsedEventSessionId.data,
		include: {
			hostUser: true,
			eventTier: true,
			channels: true,
			eventMessages: true
		}
	});
	if (!eventSession || !ADD_VC_ALLOWED_EVENT_STATES.has(eventSession.state)) {
		await interaction.editReply({
			content: 'Selected event must be in draft or active state.'
		});
		return;
	}

	const dbUser = await container.utilities.userDirectory
		.getOrThrow({
			discordUserId: interaction.user.id
		})
		.catch(() => null);
	if (!dbUser) {
		await interaction.editReply({
			content: 'Could not resolve your database user.'
		});
		return;
	}

	const existingChannelRow = eventSession.channels.find((channel) => channel.channelId === targetVoiceChannelId);
	const parentVoiceChannelId = eventSession.channels.find((channel) => channel.kind === EventSessionChannelKind.PARENT_VC)?.channelId ?? null;
	if (existingChannelRow?.kind === EventSessionChannelKind.PARENT_VC) {
		await interaction.editReply({
			content: `Channel <#${targetVoiceChannelId}> is already the parent VC for event **${eventSession.name}**.`
		});
		return;
	}

	const isNewChildChannel = !existingChannelRow;
	if (!existingChannelRow) {
		const existingReservation = await findReservedEventVoiceChannelReservation({
			channelId: targetVoiceChannelId,
			excludeEventSessionId: eventSession.id
		});
		if (existingReservation) {
			await interaction.editReply({
				content: `Channel <#${targetVoiceChannelId}> is already reserved by event **${existingReservation.eventSession.name}** (#${existingReservation.eventSessionId}, ${existingReservation.eventSession.state}).`
			});
			return;
		}

		await upsertEventSessionChannel({
			eventSessionId: eventSession.id,
			channelId: targetVoiceChannelId,
			kind: EventSessionChannelKind.CHILD_VC,
			addedByDbUserId: dbUser.id
		});
	}

	const renameTo = interaction.options.getString('rename_channel_to')?.trim() ?? '';
	if (renameTo.length > 0) {
		if (targetVoiceChannel) {
			await targetVoiceChannel.setName(renameTo.slice(0, 100), `Event add-vc by ${interaction.user.tag}`).catch((error: unknown) => {
				logger.warn(
					{
						err: error,
						eventSessionId: eventSession.id,
						voiceChannelId: targetVoiceChannelId
					},
					'Failed to rename child voice channel during event add-vc'
				);
			});
		} else {
			logger.warn(
				{
					eventSessionId: eventSession.id,
					voiceChannelId: targetVoiceChannelId
				},
				'Skipped rename because target voice channel could not be resolved'
			);
		}
	}

	const refreshedEventSession = await findUniqueEventSession({
		eventSessionId: eventSession.id,
		include: {
			hostUser: true,
			eventTier: true,
			channels: true,
			eventMessages: true
		}
	});
	if (refreshedEventSession) {
		await syncTrackingSummaryMessage({
			guild: interaction.guild,
			eventSession: refreshedEventSession,
			logger
		});
	}

	if (isNewChildChannel) {
		await postChildVcAddedLogToEventThread({
			guild: interaction.guild,
			threadId: eventSession.threadId,
			eventName: eventSession.name,
			actorDiscordUserId: interaction.user.id,
			channelId: targetVoiceChannelId,
			parentVoiceChannelId,
			logger
		});

		const parentVoiceChannelMention = parentVoiceChannelId ? `<#${parentVoiceChannelId}>` : 'unknown parent VC';
		const publicMessage = `<@${interaction.user.id}> added <#${targetVoiceChannelId}> as a child VC under ${parentVoiceChannelMention} for **${eventSession.name}**.`;
		const publicAnnouncement = await postPublicAddVcMessages({
			guild: interaction.guild,
			parentVoiceChannelId,
			childVoiceChannelId: targetVoiceChannelId,
			childVoiceChannel: targetVoiceChannel,
			content: publicMessage,
			eventSessionId: eventSession.id,
			logger
		});

		if (publicAnnouncement.childPosted && publicAnnouncement.parentPosted) {
			await interaction.deleteReply().catch(() => null);
			return;
		}

		await interaction.editReply({
			content: 'Event channel was added, but I could not post the success message in both parent and child VC chats. Check bot permissions.'
		});
		return;
	}

	await interaction.editReply({
		content: `Channel <#${targetVoiceChannelId}> is already tracked for event **${eventSession.name}**.`
	});
}

async function postChildVcAddedLogToEventThread({
	guild,
	threadId,
	eventName,
	actorDiscordUserId,
	channelId,
	parentVoiceChannelId,
	logger
}: {
	guild: import('discord.js').Guild;
	threadId: string;
	eventName: string;
	actorDiscordUserId: string;
	channelId: string;
	parentVoiceChannelId: string | null;
	logger: ExecutionContext['logger'];
}) {
	const threadChannel = guild.channels.cache.get(threadId) ?? (await guild.channels.fetch(threadId).catch(() => null));
	if (!threadChannel || !threadChannel.isTextBased()) {
		logger.warn(
			{
				threadId,
				channelId
			},
			'Could not resolve event thread while logging child VC addition'
		);
		return;
	}

	await threadChannel
		.send({
			content: `<@${actorDiscordUserId}> added <#${channelId}> as a child VC under ${
				parentVoiceChannelId ? `<#${parentVoiceChannelId}>` : 'unknown parent VC'
			} for **${eventName}**.`
		})
		.catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					threadId,
					channelId
				},
				'Failed to post child VC addition log to event thread'
			);
		});
}

async function postPublicAddVcMessages({
	guild,
	parentVoiceChannelId,
	childVoiceChannelId,
	childVoiceChannel,
	content,
	eventSessionId,
	logger
}: {
	guild: import('discord.js').Guild;
	parentVoiceChannelId: string | null;
	childVoiceChannelId: string;
	childVoiceChannel: VoiceBasedChannel | null;
	content: string;
	eventSessionId: number;
	logger: ExecutionContext['logger'];
}) {
	let childPosted = false;
	let parentPosted = false;

	if (childVoiceChannel && 'send' in childVoiceChannel && typeof childVoiceChannel.send === 'function') {
		const message = await childVoiceChannel.send({ content }).catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					eventSessionId,
					voiceChannelId: childVoiceChannelId
				},
				'Failed to post add-vc announcement in child VC chat'
			);
			return null;
		});
		childPosted = Boolean(message);
	} else {
		logger.warn(
			{
				eventSessionId,
				voiceChannelId: childVoiceChannelId
			},
			'Child voice channel does not support VC chat messages for add-vc announcement'
		);
	}

	if (parentVoiceChannelId) {
		const parentVoiceChannel = await container.utilities.guild
			.getVoiceBasedChannelOrThrow({
				guild,
				channelId: parentVoiceChannelId
			})
			.catch(() => null);
		if (parentVoiceChannel && 'send' in parentVoiceChannel && typeof parentVoiceChannel.send === 'function') {
			const message = await parentVoiceChannel.send({ content }).catch((error: unknown) => {
				logger.warn(
					{
						err: error,
						eventSessionId,
						voiceChannelId: parentVoiceChannelId
					},
					'Failed to post add-vc announcement in parent VC chat'
				);
				return null;
			});
			parentPosted = Boolean(message);
		} else {
			logger.warn(
				{
					eventSessionId,
					voiceChannelId: parentVoiceChannelId
				},
				'Parent voice channel does not support VC chat messages for add-vc announcement'
			);
		}
	} else {
		logger.warn(
			{
				eventSessionId,
				childVoiceChannelId
			},
			'Parent VC channel id is missing on event session while posting add-vc announcement'
		);
	}

	return {
		childPosted,
		parentPosted
	};
}
