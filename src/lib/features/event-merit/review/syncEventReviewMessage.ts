import type { Guild } from 'discord.js';
import { syncEventReviewPresentation } from '../presentation/syncEventReviewPresentation';

type SyncEventReviewMessageParams = {
	guild: Guild;
	eventSessionId: number;
	page?: number;
	logger: {
		warn: (...values: readonly unknown[]) => void;
	};
};

export async function syncEventReviewMessage({ guild, eventSessionId, page = 1, logger }: SyncEventReviewMessageParams) {
	return syncEventReviewPresentation({
		guild,
		eventSessionId,
		page,
		logger
	});
}
