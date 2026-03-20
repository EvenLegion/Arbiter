import type { GuildMember } from 'discord.js';

import { listCachedDivisions } from '../../discord/guild/divisions';
import type { ExecutionContext } from '../../logging/executionContext';
import { reconcileDivisionMemberships } from './reconcileDivisionMemberships';
import { createDivisionMembershipDeps } from './createDivisionMembershipDeps';

type ReconcileRolesAndMembershipsParams = {
	discordUser: GuildMember;
	context: ExecutionContext;
};

type MembershipSummaryDivision = {
	discordRoleId: string | null | undefined;
	divisionName: string | undefined;
};

type MembershipSummary = {
	discordUserId: string;
	discordUsername: string;
	discordNickname: string | null;
	addedDivisions?: MembershipSummaryDivision[];
	removedDivisions?: MembershipSummaryDivision[];
};

export const reconcileGuildMemberDivisionMemberships = async ({ discordUser, context }: ReconcileRolesAndMembershipsParams) => {
	const caller = 'reconcileGuildMemberDivisionMemberships';
	const logger = context.logger.child({ caller });

	const allDivisions = await listCachedDivisions({});
	const result = await reconcileDivisionMemberships(
		createDivisionMembershipDeps({
			trackedDivisions: allDivisions
		}),
		{
			discordUserId: discordUser.id,
			currentRoleIds: discordUser.roles.cache.keys()
		}
	);

	const summary: MembershipSummary = {
		discordUserId: discordUser.id,
		discordUsername: discordUser.user.username,
		discordNickname: discordUser.nickname
	};
	if (result.addedDivisions.length > 0) {
		logger.debug(
			{
				discordUserId: discordUser.id,
				discordUsername: discordUser.user.username,
				discordNickname: discordUser.nickname,
				discordRolesToAdd: result.addedDivisions.map((division) => ({
					discordRoleId: division.discordRoleId,
					divisionName: division.name
				}))
			},
			'Adding division memberships to user'
		);
		summary.addedDivisions = result.addedDivisions.map((division) => ({
			discordRoleId: division.discordRoleId,
			divisionName: division.name
		}));
	}

	if (result.removedDivisions.length > 0) {
		logger.debug(
			{
				discordUserId: discordUser.id,
				discordUsername: discordUser.user.username,
				discordNickname: discordUser.nickname,
				discordRolesToRemove: result.removedDivisions.map((division) => ({
					discordRoleId: division.discordRoleId,
					divisionName: division.name
				}))
			},
			'Removing division memberships from user'
		);
		summary.removedDivisions = result.removedDivisions.map((division) => ({
			discordRoleId: division.discordRoleId,
			divisionName: division.name
		}));
	}

	logger.info(summary, 'Reconciled roles and memberships for user');
};
