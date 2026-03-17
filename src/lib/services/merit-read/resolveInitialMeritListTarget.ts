import type { LoadInitialMeritListInput, MeritReadServiceDeps } from './meritReadTypes';

export async function resolveInitialMeritListTarget(deps: MeritReadServiceDeps, input: LoadInitialMeritListInput) {
	if (!input.requestedTargetDiscordUserId || input.requestedTargetDiscordUserId === input.requesterMember.discordUserId) {
		return {
			kind: 'resolved' as const,
			member: input.requesterMember
		};
	}

	if (!input.actor.capabilities.isStaff) {
		return {
			kind: 'forbidden_other_user' as const
		};
	}

	const targetMember = await deps.getMember({
		discordUserId: input.requestedTargetDiscordUserId
	});
	if (!targetMember || targetMember.isBot) {
		return {
			kind: 'target_not_found' as const
		};
	}

	return {
		kind: 'resolved' as const,
		member: targetMember
	};
}
