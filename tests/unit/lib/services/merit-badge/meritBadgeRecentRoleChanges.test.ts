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

	it('keeps only the latest change for a role', () => {
		const changes = createRecentRoleChanges({ now: () => 0 });
		changes.record('member-1', 'role-a', true);
		changes.record('member-1', 'role-a', false);

		expect([...changes.apply('member-1', ['role-a'])]).toEqual([]);
	});
});
