import { EventSessionChannelKind } from '@prisma/client';
import type { Guild } from 'discord.js';

import { ENV_DISCORD } from '../../../../config/env/discord';
import type { ExecutionContext } from '../../../logging/executionContext';
import type { EventLifecycleEventSession } from '../../../services/event-lifecycle';
import { resolveSendCapableVoiceChannel, sendMessageToChannel } from '../presentation/eventDiscordMessageGateway';

const ENDED_EVENT_FEEDBACK_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfhVeowiJ9ZbvaPpFKwVRPW9NGorD2r_TFxbyyzEDCEBL3KpQ/viewform';
const ENDED_EVENT_FEEDBACK_FORM_EVENT_NAME_FIELD = 'entry.85184095';

export async function postEndedEventFeedbackLinks({
	guild,
	eventSession,
	logger
}: {
	guild: Guild;
	eventSession: EventLifecycleEventSession;
	logger: ExecutionContext['logger'];
}) {
	const trackedVoiceChannelIds = [
		...new Set(
			eventSession.channels
				.filter((channel) => channel.kind === EventSessionChannelKind.PARENT_VC || channel.kind === EventSessionChannelKind.CHILD_VC)
				.map((channel) => channel.channelId)
		)
	];
	const feedbackFormMessage = buildEndedEventFeedbackFormMessage(eventSession.name);

	for (const channelId of trackedVoiceChannelIds) {
		const channel = await resolveSendCapableVoiceChannel({
			guild,
			channelId
		});
		if (!channel) {
			logger.warn(
				{
					eventSessionId: eventSession.id,
					channelId
				},
				'Skipped ended-event feedback link post for voice channel without send support'
			);
			continue;
		}

		await sendMessageToChannel({
			channel,
			payload: {
				content: feedbackFormMessage
			},
			logger,
			failureLogMessage: 'Failed to post ended-event feedback link',
			logBindings: {
				eventSessionId: eventSession.id
			}
		});
	}
}

function buildEndedEventFeedbackFormMessage(eventName: string) {
	const feedbackFormUrl = buildEndedEventFeedbackFormUrl(eventName);
	return [
		`Thank you for attending the event <:LgnSalute:${ENV_DISCORD.LGN_SALUTE_EMOJI_ID}>`,
		`Please fill out [this form](${feedbackFormUrl}) to provide feedback on the event`
	].join('\n');
}

function buildEndedEventFeedbackFormUrl(eventName: string) {
	const url = new URL(ENDED_EVENT_FEEDBACK_FORM_URL);
	url.searchParams.set('usp', 'pp_url');
	url.searchParams.set(ENDED_EVENT_FEEDBACK_FORM_EVENT_NAME_FIELD, eventName);
	return url.toString();
}
