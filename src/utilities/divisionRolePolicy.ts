import type { Division, DivisionKind } from '@prisma/client';
import { Utility } from '@sapphire/plugin-utilities-store';
import type { GuildMember } from 'discord.js';

type MemberHasDivisionKindRoleParams = {
	member: GuildMember;
	requiredRoleKinds: DivisionKind[];
};

type MemberHasDivisionParams = {
	member: GuildMember;
	divisionDbId?: number;
	divisionCode?: string;
	divisionDiscordRoleId?: string;
};

export class DivisionRolePolicyUtility extends Utility {
	public constructor(context: Utility.LoaderContext, options: Utility.Options) {
		super(context, {
			...options,
			name: 'divisionRolePolicy'
		});
	}

	public async memberHasDivisionKindRole({
		member,
		requiredRoleKinds
	}: MemberHasDivisionKindRoleParams): Promise<boolean> {
		if (requiredRoleKinds.length === 0) {
			return true;
		}

		const divisions = await this.container.utilities.divisionCache.get({ kinds: requiredRoleKinds });
		const requiredRoleIds = divisions
			.map((division) => division.discordRoleId)
			.filter((roleId): roleId is string => Boolean(roleId));

		return requiredRoleIds.some((roleId) => member.roles.cache.has(roleId));
	}

	public async memberHasDivision(
		{
			member,
			divisionDiscordRoleId,
			divisionDbId,
			divisionCode,
		}: MemberHasDivisionParams
	): Promise<boolean> {
		if (!divisionDiscordRoleId && !divisionCode && !divisionDbId) {
			throw new Error('Either divisionDiscordRoleId, divisionCode, or divisionDbId must be provided');
		}

		let division: Division | undefined;
		if (divisionDbId) {
			division = await this.container.utilities.divisionCache.getByDbId(divisionDbId);
		}

		if (divisionDiscordRoleId) {
			division = await this.container.utilities.divisionCache.getByDiscordRoleId(divisionDiscordRoleId);
		}

		if (divisionCode) {
			division = await this.container.utilities.divisionCache.getByCode(divisionCode);
		}

		if (division === undefined) {
			throw new Error(`Division not found: divisionDbId=${divisionDbId}, divisionDiscordRoleId=${divisionDiscordRoleId}, divisionCode=${divisionCode}`);
		}

		if (division.discordRoleId === null) {
			throw new Error(`Division has no discord role: divisionDbId=${divisionDbId}, divisionDiscordRoleId=${divisionDiscordRoleId}, divisionCode=${divisionCode}`);
		}

		return member.roles.cache.has(division.discordRoleId);
	}
}

declare module '@sapphire/plugin-utilities-store' {
	interface Utilities {
		divisionRolePolicy: DivisionRolePolicyUtility;
	}
}
