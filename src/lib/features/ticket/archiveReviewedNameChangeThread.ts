import { isArchivableThread, type NameChangeReviewLogger } from './nameChangeReviewThreadGateway.shared';

export async function archiveReviewedNameChangeThread({
	channel,
	channelId,
	requestId,
	decisionVerb,
	reviewerTag,
	logger
}: {
	channel: unknown;
	channelId: string | null;
	requestId: number;
	decisionVerb: string;
	reviewerTag: string;
	logger: NameChangeReviewLogger;
}) {
	if (!isArchivableThread(channel) || channel.archived) {
		return;
	}

	await channel.setArchived(true, `Name change request ${decisionVerb} by ${reviewerTag}`).catch((error: unknown) => {
		logger.warn(
			{
				err: error,
				channelId,
				nameChangeRequestId: requestId
			},
			'Failed to archive reviewed name change request thread'
		);
	});
}
