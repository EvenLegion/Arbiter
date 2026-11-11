/**
 * Members whose badge roles Arbiter changed recently.
 *
 * discord.js does not update the cached member after a single-role add or remove; the cache
 * catches up only when Discord's member update event arrives, and that can be late or out of step
 * with later changes. A sync for a member listed here fetches the member fresh from Discord instead
 * of trusting the cache, so it never plans from stale roles (which could leave two badges) and it
 * still sees a hand edit made in between. Other members use the cache, so a no-op sync for them
 * makes zero Discord calls. Entries expire after `ttlMs`, by which time the cache has caught up.
 */
export type RecentlyChangedMembers = {
	mark: (discordUserId: string) => void;
	has: (discordUserId: string) => boolean;
};

export const RECENTLY_CHANGED_MEMBER_TTL_MS = 60_000;

export function createRecentlyChangedMembers({
	ttlMs = RECENTLY_CHANGED_MEMBER_TTL_MS,
	now = Date.now
}: { ttlMs?: number; now?: () => number } = {}): RecentlyChangedMembers {
	const changedAtByMember = new Map<string, number>();

	return {
		mark(discordUserId) {
			const at = now();
			for (const [memberId, changedAt] of changedAtByMember) {
				if (at - changedAt >= ttlMs) {
					changedAtByMember.delete(memberId);
				}
			}
			changedAtByMember.set(discordUserId, at);
		},
		has(discordUserId) {
			const changedAt = changedAtByMember.get(discordUserId);
			return changedAt !== undefined && now() - changedAt < ttlMs;
		}
	};
}

/** Shared by every badge sync path, like the member lock. Only read and written inside that lock. */
export const MERIT_BADGE_RECENTLY_CHANGED_MEMBERS: RecentlyChangedMembers = createRecentlyChangedMembers();
