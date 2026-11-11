import { describe, expect, it, vi } from 'vitest';

import { createMeritBadgeRoleMap } from '../../../../../src/config/meritBadgeRoles';
import { notifyMeritRankUp } from '../../../../../src/lib/services/merit-rank/notifyMeritRankUp';

const ALL_ROLES = createMeritBadgeRoleMap(new Map(Array.from({ length: 36 }, (_, index) => [index + 1, `${100000000000000000 + index}`])));
const NO_ROLES = createMeritBadgeRoleMap(new Map());

describe('notifyMeritRankUp', () => {
	it('sends the badge DM on a new section once the tier has a role', async () => {
		const member = createMember();

		await expect(notify({ member, previousTotalMerits: 10, currentTotalMerits: 12, badgeRoles: ALL_ROLES })).resolves.toBe(true);

		expect(member.user.send).toHaveBeenCalledWith(
			[
				"Congratulations, Legionnaire! You've earned the **Aes III** merit badge!",
				'You have **12 merits** total.',
				'Next badge **Argentum I** in **4 merits**.'
			].join('\n')
		);
	});

	it('sends no DM when the badge does not change, even if the legacy level does', async () => {
		const member = createMember();

		// 12 is legacy level 4 (from 11 at level 3), but both totals hold Aes III.
		await expect(notify({ member, previousTotalMerits: 11, currentTotalMerits: 12, badgeRoles: ALL_ROLES })).resolves.toBe(false);

		expect(member.user.send).not.toHaveBeenCalled();
	});

	it('sends no DM when a demerit drops the member a section', async () => {
		const member = createMember();

		await expect(notify({ member, previousTotalMerits: 16, currentTotalMerits: 12, badgeRoles: ALL_ROLES })).resolves.toBe(false);

		expect(member.user.send).not.toHaveBeenCalled();
	});

	it('keeps the legacy rank-up DM while no badge role is configured', async () => {
		const member = createMember();

		await expect(notify({ member, previousTotalMerits: 11, currentTotalMerits: 12, badgeRoles: NO_ROLES })).resolves.toBe(true);

		expect(member.user.send).toHaveBeenCalledWith(
			[
				"Congratulations, Legionnaire! You've ranked up to **Level 4**!",
				'You have **12 merits** total.',
				'Next rank level in **6 merits**.'
			].join('\n')
		);
	});

	it('logs a warning with tier fields when the badge DM fails', async () => {
		const member = createMember();
		const error = new Error('Cannot send messages to this user');
		member.user.send.mockRejectedValueOnce(error);
		const logger = { warn: vi.fn() };

		await expect(
			notifyMeritRankUp({
				member: member as never,
				previousTotalMerits: 0,
				currentTotalMerits: 1,
				logger: logger as never,
				badgeRoles: ALL_ROLES
			})
		).resolves.toBe(true);

		expect(logger.warn).toHaveBeenCalledWith(
			{
				err: error,
				discordUserId: 'member-1',
				previousTotalMerits: 0,
				currentTotalMerits: 1,
				previousTier: null,
				currentTier: 1
			},
			'Failed to DM merit badge notification'
		);
	});
});

function notify(params: {
	member: ReturnType<typeof createMember>;
	previousTotalMerits: number;
	currentTotalMerits: number;
	badgeRoles: ReturnType<typeof createMeritBadgeRoleMap>;
}) {
	return notifyMeritRankUp({
		...params,
		member: params.member as never,
		logger: { warn: vi.fn() } as never
	});
}

function createMember() {
	return {
		id: 'member-1',
		user: {
			send: vi.fn().mockResolvedValue(undefined)
		}
	};
}
