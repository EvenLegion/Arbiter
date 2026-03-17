import type { Prisma } from '@prisma/client';
import { type ButtonInteraction, type Guild } from 'discord.js';
import type { ExecutionContext } from '../../../logging/executionContext';
import { syncEventLifecyclePresentation } from '../presentation/syncEventLifecyclePresentation';

type EventSessionWithRelations = Prisma.EventGetPayload<{
	include: {
		hostUser: true;
		eventTier: {
			include: {
				meritType: true;
			};
		};
		channels: true;
		eventMessages: true;
	};
}>;

export async function syncStartConfirmationMessages({
	interaction,
	guild,
	eventSession,
	actorDiscordUserId,
	logger
}: {
	interaction: ButtonInteraction;
	guild: Guild;
	eventSession: EventSessionWithRelations;
	actorDiscordUserId: string;
	logger: ExecutionContext['logger'];
}) {
	await syncEventLifecyclePresentation({
		interaction,
		guild,
		eventSession,
		actorDiscordUserId,
		logger
	});
}
