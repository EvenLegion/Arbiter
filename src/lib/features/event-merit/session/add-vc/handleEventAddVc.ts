import type { VoiceBasedChannel } from 'discord.js';
import { z } from 'zod';
import { createInteractionResponder } from '../../../../discord/interactions/interactionResponder';
import { resolveConfiguredGuild, resolveInteractionActor } from '../../../../discord/interactions/interactionPreflight';
import type { ExecutionContext } from '../../../../logging/executionContext';
import { resolveEventVoiceChannel } from '../../gateways/resolveEventChannels';
import { runAddTrackedChannelAction } from './runAddTrackedChannelAction';

type HandleEventAddVcParams = {
	interaction: import('@sapphire/plugin-subcommands').Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
};

const EVENT_SESSION_ID_SCHEMA = z.coerce.number().int().positive();
export async function handleEventAddVc({ interaction, context }: HandleEventAddVcParams) {
	const caller = 'handleEventAddVc';
	const logger = context.logger.child({ caller });
	const responder = createInteractionResponder({
		interaction,
		context,
		logger,
		caller
	});

	await responder.deferEphemeralReply();

	const guild = await resolveConfiguredGuild({
		interaction,
		responder,
		logger,
		logMessage: 'Failed to resolve configured guild while handling event add-vc',
		failureMessage: 'This command can only be used in a server.'
	});
	if (!guild) {
		return;
	}

	const actor = await resolveInteractionActor({
		guild,
		discordUserId: interaction.user.id,
		responder,
		logger,
		logMessage: 'Failed to resolve actor while handling event add-vc',
		failureMessage: 'Could not resolve your member record in this server.',
		resolveDbUser: true,
		dbUserFailureMessage: 'Could not resolve your database user.',
		discordTag: interaction.user.tag
	});
	if (!actor) {
		return;
	}

	const requestedVoiceChannelId = interaction.options.getString('voice_channel')?.trim() ?? '';
	let targetVoiceChannelId: string | null = null;
	let targetVoiceChannel: VoiceBasedChannel | null = null;

	// If a voice channel was provided, use it, otherwise use the user's current voice channel.
	if (requestedVoiceChannelId.length > 0) {
		targetVoiceChannel = await resolveEventVoiceChannel(guild, requestedVoiceChannelId);
		if (!targetVoiceChannel) {
			await responder.safeEditReply({
				content: 'Selected `voice_channel` was not found or is not voice-based.'
			});
			return;
		}

		targetVoiceChannelId = targetVoiceChannel.id;
	} else {
		if (!actor.member.voice.channelId || !actor.member.voice.channel || !actor.member.voice.channel.isVoiceBased()) {
			await responder.safeEditReply({
				content: 'You must be in a voice channel or provide `voice_channel`.'
			});
			return;
		}

		targetVoiceChannelId = actor.member.voice.channelId;
		targetVoiceChannel = actor.member.voice.channel;
	}

	const rawEventSessionId = interaction.options.getString('event_selection', true);
	const parsedEventSessionId = EVENT_SESSION_ID_SCHEMA.safeParse(rawEventSessionId);
	if (!parsedEventSessionId.success) {
		await responder.safeEditReply({
			content: 'Invalid event selection.'
		});
		return;
	}

	const renameTo = interaction.options.getString('rename_channel_to')?.trim() ?? '';
	const response = await runAddTrackedChannelAction({
		guild,
		targetVoiceChannel,
		logger,
		input: {
			actor: actor.actor,
			eventSessionId: parsedEventSessionId.data,
			targetVoiceChannelId,
			renameTo: renameTo.length > 0 ? renameTo : null,
			actorTag: interaction.user.tag
		}
	});
	if (response.delivery === 'deleteReply') {
		await interaction.deleteReply().catch(() => null);
		return;
	}

	await responder.safeEditReply({
		content: response.content
	});
}
