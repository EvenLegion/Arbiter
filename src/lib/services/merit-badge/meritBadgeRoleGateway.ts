import type { GuildMember } from 'discord.js';

export type MeritBadgeRoleErrorCode =
	/** Discord 50013: Arbiter lacks Manage Roles, or the badge role sits above Arbiter's highest role. */
	| 'missing_permissions'
	/** Discord 10011: the configured role ID does not exist in the guild. */
	| 'unknown_role'
	/** Discord 10007: the member left the guild. */
	| 'unknown_member'
	/** Any other failure. */
	| 'request_failed';

export type MeritBadgeRoleChangeResult =
	| { ok: true }
	| {
			ok: false;
			code: MeritBadgeRoleErrorCode;
			discordErrorCode?: number;
			errorName?: string;
	  };

const DISCORD_ERROR_CODES: ReadonlyMap<number, MeritBadgeRoleErrorCode> = new Map([
	[50013, 'missing_permissions'],
	[10011, 'unknown_role'],
	[10007, 'unknown_member']
]);

export const DEFAULT_MERIT_BADGE_AUDIT_REASON = 'Merit badge sync';

/**
 * Adds or removes one badge role on one member. Uses the single-role routes
 * (`member.roles.add(roleId)`), never the array form, which rewrites the member's whole role list.
 * Never throws: Discord errors come back as typed codes.
 */
export function createMeritBadgeRoleGateway({ auditReason = DEFAULT_MERIT_BADGE_AUDIT_REASON }: { auditReason?: string } = {}) {
	return {
		addRole: (member: GuildMember, roleId: string) => runRoleChange(() => member.roles.add(roleId, auditReason)),
		removeRole: (member: GuildMember, roleId: string) => runRoleChange(() => member.roles.remove(roleId, auditReason))
	};
}

async function runRoleChange(change: () => Promise<unknown>): Promise<MeritBadgeRoleChangeResult> {
	try {
		await change();
		return { ok: true };
	} catch (error) {
		return toMeritBadgeRoleFailure(error);
	}
}

export function toMeritBadgeRoleFailure(error: unknown): Extract<MeritBadgeRoleChangeResult, { ok: false }> {
	const rawCode = error && typeof error === 'object' ? Reflect.get(error, 'code') : undefined;
	const discordErrorCode =
		typeof rawCode === 'number' ? rawCode : typeof rawCode === 'string' && /^\d+$/.test(rawCode) ? Number(rawCode) : undefined;
	const errorName = error instanceof Error ? error.name : undefined;

	return {
		ok: false,
		code: (discordErrorCode !== undefined ? DISCORD_ERROR_CODES.get(discordErrorCode) : undefined) ?? 'request_failed',
		...(discordErrorCode !== undefined ? { discordErrorCode } : {}),
		...(errorName ? { errorName } : {})
	};
}
