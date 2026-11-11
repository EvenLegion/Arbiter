import { describe, expect, it } from 'vitest';

import { createRecentRoleChanges } from '../../../../../src/lib/services/merit-badge/meritBadgeRecentRoleChanges';

describe('createRecentRoleChanges', () => {
	it('overlays recent adds and removes on the given roles until they expire', () => {
		let clock = 0;
		const changes = createRecentRoleChanges({ ttlMs: 1_000, now: () => clock });
		changes.record('member-1', 'role-b', true);
		changes.record('member-1', 'role-a', false);

		expect([...changes.apply('member-1', ['role-a', 'role-x'])]).toEqual(['role-x', 'role-b']);
		expect([...changes.apply('member-2', ['role-a'])]).toEqual(['role-a']);

		clock = 1_000;
		expect([...changes.apply('member-1', ['role-a', 'role-x'])]).toEqual(['role-a', 'role-x']);
	});

	it('drops a change once the cached roles agree, so a later manual edit shows through', () => {
		const changes = createRecentRoleChanges({ now: () => 0 });
		changes.record('member-1', 'badge-b', true);
		changes.record('member-1', 'badge-a', false);

		// Cache still stale: the overlay applies.
		expect([...changes.apply('member-1', ['badge-a'])]).toEqual(['badge-b']);
		// Discord's update arrived: the cache agrees with both changes.
		expect([...changes.apply('member-1', ['badge-b'])]).toEqual(['badge-b']);
		// Someone removes badge-b and re-adds badge-a by hand within the TTL: the sync sees it.
		expect([...changes.apply('member-1', ['badge-a'])]).toEqual(['badge-a']);
	});

	it('keeps only the latest change for a role', () => {
		const changes = createRecentRoleChanges({ now: () => 0 });
		changes.record('member-1', 'role-a', true);
		changes.record('member-1', 'role-a', false);

		expect([...changes.apply('member-1', ['role-a'])]).toEqual([]);
	});
});
