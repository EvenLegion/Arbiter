import { archiveReviewedNameChangeThread } from './archiveReviewedNameChangeThread';
import { createNameChangeReviewThreadCreator } from './createNameChangeReviewThread';
import { postNameChangeReviewOutcome } from './postNameChangeReviewOutcome';
import { syncEditedNameChangeThread } from './syncEditedNameChangeThread';
import { syncReviewedNameChangeMessage } from './syncReviewedNameChangeMessage';
import type { NameChangeReviewMessage } from './nameChangeReviewThreadGateway.shared';

export { createNameChangeReviewThreadCreator, syncEditedNameChangeThread };

export async function syncReviewedNameChangeThread(params: {
	message: NameChangeReviewMessage;
	channel: unknown;
	channelId: string | null;
	requestId: number;
	requesterDiscordUserId: string;
	reviewerDiscordUserId: string;
	reviewerTag: string;
	statusLabel: string;
	decisionVerb: string;
	logger: {
		error: (...values: readonly unknown[]) => void;
		warn: (...values: readonly unknown[]) => void;
	};
}) {
	await syncReviewedNameChangeMessage({
		message: params.message,
		requestId: params.requestId,
		statusLabel: params.statusLabel,
		reviewerDiscordUserId: params.reviewerDiscordUserId,
		logger: params.logger
	});

	await postNameChangeReviewOutcome({
		channel: params.channel,
		channelId: params.channelId,
		requesterDiscordUserId: params.requesterDiscordUserId,
		reviewerDiscordUserId: params.reviewerDiscordUserId,
		decisionVerb: params.decisionVerb,
		logger: params.logger
	});

	await archiveReviewedNameChangeThread({
		channel: params.channel,
		channelId: params.channelId,
		requestId: params.requestId,
		decisionVerb: params.decisionVerb,
		reviewerTag: params.reviewerTag,
		logger: params.logger
	});
}
