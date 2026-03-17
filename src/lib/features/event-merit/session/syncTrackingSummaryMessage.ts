import type { Guild } from 'discord.js';

import { syncEventTrackingSummaryPresentation, type EventTrackingPresentationSession } from '../presentation/syncEventTrackingPresentation';

type SyncTrackingSummaryMessageParams = {
	guild: Guild;
	eventSession: EventTrackingPresentationSession;
	logger: {
		warn: (...values: readonly unknown[]) => void;
	};
};

export async function syncTrackingSummaryMessage({ guild, eventSession, logger }: SyncTrackingSummaryMessageParams) {
	return syncEventTrackingSummaryPresentation({
		guild,
		eventSession,
		logger
	});
}
