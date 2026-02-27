import type { GuildMember } from 'discord.js';

import { createManyDivisionMembership, deleteManyDivisionMembership, findManyUsersDivisions } from '../../../integrations/prisma';
import { container } from '@sapphire/framework';
import type { ExecutionContext } from '../../logging/executionContext';

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

export const reconcileRolesAndMemberships = async ({ discordUser, context }: ReconcileRolesAndMembershipsParams) => {
	const caller = 'reconcileRolesAndMemberships';
	const logger = context.logger.child({ caller });

	const currentRoleIds = new Set(discordUser.roles.cache.map((role) => role.id));
	const allDivisions = await container.utilities.divisionCache.get({});
	const desiredDivisionIds = allDivisions
		.filter((division) => division.discordRoleId && currentRoleIds.has(division.discordRoleId))
		.map((division) => division.id);

	const existingMembershipDivisions = await findManyUsersDivisions({
		discordUserId: discordUser.id
	});
	const existingMembershipDivisionIds = new Set(existingMembershipDivisions.map((division) => division.id));

	const divisionIdsToAdd = desiredDivisionIds.filter((divisionId) => !existingMembershipDivisionIds.has(divisionId));
	const divisionIdsToRemove = existingMembershipDivisions
		.filter((division) => !desiredDivisionIds.includes(division.id))
		.map((division) => division.id);

	const summary: MembershipSummary = {
		discordUserId: discordUser.id,
		discordUsername: discordUser.user.username,
		discordNickname: discordUser.nickname
	};
	if (divisionIdsToAdd.length > 0) {
		logger.debug(
			{
				discordUserId: discordUser.id,
				discordUsername: discordUser.user.username,
				discordNickname: discordUser.nickname,
				discordRolesToAdd: divisionIdsToAdd.map((divisionId) => {
					const division = allDivisions.find((item) => item.id === divisionId);
					return {
						discordRoleId: division?.discordRoleId,
						divisionName: division?.name
					};
				})
			},
			'Adding division memberships to user'
		);
		await createManyDivisionMembership({
			discordUserId: discordUser.id,
			divisionIds: divisionIdsToAdd
		});

		summary.addedDivisions = divisionIdsToAdd.map((divisionId) => {
			const division = allDivisions.find((item) => item.id === divisionId);
			return {
				discordRoleId: division?.discordRoleId,
				divisionName: division?.name
			};
		});
	}

	if (divisionIdsToRemove.length > 0) {
		logger.debug(
			{
				discordUserId: discordUser.id,
				discordUsername: discordUser.user.username,
				discordNickname: discordUser.nickname,
				discordRolesToRemove: divisionIdsToRemove.map((divisionId) => {
					const division = allDivisions.find((item) => item.id === divisionId);
					return {
						discordRoleId: division?.discordRoleId,
						divisionName: division?.name
					};
				})
			},
			'Removing division memberships from user'
		);
		await deleteManyDivisionMembership({
			discordUserId: discordUser.id,
			divisionIds: divisionIdsToRemove
		});

		summary.removedDivisions = divisionIdsToRemove.map((divisionId) => {
			const division = allDivisions.find((item) => item.id === divisionId);
			return {
				discordRoleId: division?.discordRoleId,
				divisionName: division?.name
			};
		});
	}

	logger.info(summary, 'Reconciled roles and memberships for user');
};
