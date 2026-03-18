import type { Guild, Message } from 'discord.js';

import { getGuildChannel, getVoiceBasedGuildChannel } from '../../../discord/guild/configuredGuild';

type EventMessageLogger = {
	warn: (...values: readonly unknown[]) => void;
};

type SendCapableChannel = {
	id: string;
	send: (payload: string | { content: string } | Record<string, unknown>) => Promise<Message>;
};

type MessageCapableChannel = SendCapableChannel & {
	messages: {
		fetch: (messageId: string) => Promise<Message>;
	};
};

function isSendCapableChannel(value: unknown): value is SendCapableChannel {
	return typeof value === 'object' && value !== null && 'send' in value && typeof value.send === 'function' && 'id' in value;
}

function isMessageCapableChannel(value: unknown): value is MessageCapableChannel {
	return isSendCapableChannel(value) && 'messages' in value && typeof value.messages === 'object' && value.messages !== null;
}

export async function resolveSendCapableGuildChannel({ guild, channelId }: { guild: Guild; channelId: string }): Promise<SendCapableChannel | null> {
	const channel = await getGuildChannel({
		guild,
		channelId
	});

	return isSendCapableChannel(channel) ? channel : null;
}

export async function resolveSendCapableVoiceChannel({ guild, channelId }: { guild: Guild; channelId: string }): Promise<SendCapableChannel | null> {
	const channel = await getVoiceBasedGuildChannel({
		guild,
		channelId
	});

	return isSendCapableChannel(channel) ? channel : null;
}

export async function editReferencedMessage({
	guild,
	channelId,
	messageId,
	payload,
	logger,
	failureLogMessage,
	logBindings
}: {
	guild: Guild;
	channelId: string;
	messageId: string;
	payload: Record<string, unknown>;
	logger: EventMessageLogger;
	failureLogMessage: string;
	logBindings?: Record<string, unknown>;
}) {
	const channel = await getGuildChannel({
		guild,
		channelId
	});
	if (!isMessageCapableChannel(channel)) {
		return null;
	}

	return channel.messages
		.fetch(messageId)
		.then((message) =>
			message.edit({
				content: null,
				...(payload as Record<string, never>)
			})
		)
		.catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					channelId,
					messageId,
					...logBindings
				},
				failureLogMessage
			);
			return null;
		});
}

export async function sendMessageToChannel({
	channel,
	payload,
	logger,
	failureLogMessage,
	logBindings
}: {
	channel: SendCapableChannel | null;
	payload: string | { content: string } | Record<string, unknown>;
	logger: EventMessageLogger;
	failureLogMessage: string;
	logBindings?: Record<string, unknown>;
}) {
	if (!channel) {
		return null;
	}

	return channel.send(payload).catch((error: unknown) => {
		logger.warn(
			{
				err: error,
				channelId: channel.id,
				...logBindings
			},
			failureLogMessage
		);
		return null;
	});
}
