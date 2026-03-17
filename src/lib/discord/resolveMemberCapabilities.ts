import { DivisionKind } from '@prisma/client';
import type { GuildMember } from 'discord.js';

import type { ActorCapabilityDeps, ResolvedActorCapabilities } from './actorCapabilityTypes';

export async function resolveMemberCapabilitiesWithDeps(
	deps: Pick<ActorCapabilityDeps, 'hasDivisionKindRole' | 'hasDivision' | 'centurionRoleId'>,
	{
		member
	}: {
		member: GuildMember;
	}
): Promise<ResolvedActorCapabilities> {
	const [isStaff, isCenturion] = await Promise.all([
		deps.hasDivisionKindRole({
			member,
			requiredRoleKinds: [DivisionKind.STAFF]
		}),
		deps.hasDivision({
			member,
			divisionDiscordRoleId: deps.centurionRoleId
		})
	]);

	return {
		isStaff,
		isCenturion
	};
}
