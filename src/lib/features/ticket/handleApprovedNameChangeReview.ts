import type { ButtonInteraction, Guild } from 'discord.js';

import type { InteractionResponder } from '../../discord/interactionResponder';
import type { ExecutionContext } from '../../logging/executionContext';
import { reviewNameChangeAction } from './reviewNameChangeAction';

export function handleApprovedNameChangeReview(params: {
	interaction: ButtonInteraction;
	requestId: number;
	guild: Guild;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
	responder: InteractionResponder;
	reviewer: {
		dbUser: { id: string } | null;
		actor: {
			discordUserId: string;
			dbUserId: string | null;
			capabilities: {
				isStaff: boolean;
				isCenturion: boolean;
			};
			discordTag?: string;
		};
	};
}) {
	return reviewNameChangeAction({
		...params,
		decision: 'approve'
	});
}
