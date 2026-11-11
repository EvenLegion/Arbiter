/**
 * Badge role changes Arbiter made recently, per member.
 *
 * discord.js does not update the cached member after a single-role add or remove; the cache
 * catches up only when Discord's member update event arrives. Without this record, a second sync
 * for the same member that runs before that event plans from the old roles and can leave two
 * badge roles. Each sync overlays its member's recent changes on the cached roles.
 *
 * An entry is dropped as soon as the cached roles agree with it (Discord's update arrived), so a
 * manual edit made right after Arbiter's own change is seen by the next sync. Entries also expire
 * after `ttlMs` in case that update never arrives.
 */
export type RecentRoleChanges = {
	record: (discordUserId: string, roleId: string, held: boolean) => void;
	apply: (discordUserId: string, roleIds: Iterable<string>) => Set<string>;
};

export const RECENT_ROLE_CHANGE_TTL_MS = 60_000;

export function createRecentRoleChanges({
	ttlMs = RECENT_ROLE_CHANGE_TTL_MS,
	now = Date.now
}: { ttlMs?: number; now?: () => number } = {}): RecentRoleChanges {
	const changesByMember = new Map<string, Map<string, { held: boolean; at: number }>>();
	let lastPrunedAt = now();

	function pruneMember(discordUserId: string, at: number) {
		const changes = changesByMember.get(discordUserId);
		if (!changes) {
			return undefined;
		}
		for (const [roleId, change] of changes) {
			if (at - change.at >= ttlMs) {
				changes.delete(roleId);
			}
		}
		if (changes.size === 0) {
			changesByMember.delete(discordUserId);
			return undefined;
		}
		return changes;
	}

	return {
		record(discordUserId, roleId, held) {
			const at = now();
			if (at - lastPrunedAt >= ttlMs) {
				for (const memberId of [...changesByMember.keys()]) {
					pruneMember(memberId, at);
				}
				lastPrunedAt = at;
			}

			const changes = changesByMember.get(discordUserId) ?? new Map<string, { held: boolean; at: number }>();
			changes.set(roleId, { held, at });
			changesByMember.set(discordUserId, changes);
		},
		apply(discordUserId, roleIds) {
			const result = new Set(roleIds);
			const changes = pruneMember(discordUserId, now());
			if (!changes) {
				return result;
			}

			for (const [roleId, change] of changes) {
				if (result.has(roleId) === change.held) {
					// The cache has caught up, so later edits to this role must show through.
					changes.delete(roleId);
				} else if (change.held) {
					result.add(roleId);
				} else {
					result.delete(roleId);
				}
			}
			if (changes.size === 0) {
				changesByMember.delete(discordUserId);
			}
			return result;
		}
	};
}

/** Shared by every badge sync path, like the member lock. Only read and written inside that lock. */
export const MERIT_BADGE_RECENT_ROLE_CHANGES: RecentRoleChanges = createRecentRoleChanges();
