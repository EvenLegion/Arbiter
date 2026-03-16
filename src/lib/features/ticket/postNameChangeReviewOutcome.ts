import { hasSendMethod, type NameChangeReviewLogger } from './nameChangeReviewThreadGateway.shared';

export async function postNameChangeReviewOutcome({
	channel,
	channelId,
	requesterDiscordUserId,
	reviewerDiscordUserId,
	decisionVerb,
	logger
}: {
	channel: unknown;
	channelId: string | null;
	requesterDiscordUserId: string;
	reviewerDiscordUserId: string;
	decisionVerb: string;
	logger: NameChangeReviewLogger;
}) {
	if (!hasSendMethod(channel)) {
		return;
	}

	await channel
		.send({
			content: `<@${requesterDiscordUserId}>, your request was ${decisionVerb} by <@${reviewerDiscordUserId}>.`
		})
		.catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					channelId
				},
				'Failed to post name change review outcome message in thread'
			);
		});
}
