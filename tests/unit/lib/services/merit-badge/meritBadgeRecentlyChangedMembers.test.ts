import { describe, expect, it } from 'vitest';

import { createRecentlyChangedMembers } from '../../../../../src/lib/services/merit-badge/meritBadgeRecentlyChangedMembers';

describe('createRecentlyChangedMembers', () => {
	it('lists a marked member until the window passes', () => {
		let clock = 0;
		const members = createRecentlyChangedMembers({ ttlMs: 1_000, now: () => clock });
		members.mark('member-1');

		expect(members.has('member-1')).toBe(true);
		expect(members.has('member-2')).toBe(false);

		clock = 999;
		expect(members.has('member-1')).toBe(true);
		clock = 1_000;
		expect(members.has('member-1')).toBe(false);
	});

	it('restarts the window on each change', () => {
		let clock = 0;
		const members = createRecentlyChangedMembers({ ttlMs: 1_000, now: () => clock });
		members.mark('member-1');
		clock = 900;
		members.mark('member-1');
		clock = 1_500;

		expect(members.has('member-1')).toBe(true);
	});
});
