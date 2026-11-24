import { describe, expect, it, vi } from 'vitest';

import { createMeritBadgeEmojiMap } from '../../../../../src/config/meritBadgeEmojis';
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
				"Congratulations, Legionnaire! You've earned the **Argentum II** merit badge!",
				'',
				'Your badge: **Argentum II**',
				'Next badge: **Argentum III** in **2 merits**',
				'',
				'You have **12 merits** total.'
			].join('\n')
		);
	});

	it('shows the earned and next badge emojis in the badge DM', async () => {
		const member = createMember();
		const badgeEmojis = createMeritBadgeEmojiMap(
			new Map([
				[8, '300000000000000008'],
				[9, '300000000000000009']
			])
		);

		await expect(notify({ member, previousTotalMerits: 10, currentTotalMerits: 12, badgeRoles: ALL_ROLES, badgeEmojis })).resolves.toBe(true);

		expect(member.user.send).toHaveBeenCalledWith(
			[
				"Congratulations, Legionnaire! You've earned the **Argentum II** merit badge!",
				'',
				'Your badge: <:argentum_ii:300000000000000008> **Argentum II**',
				'Next badge: <:argentum_iii:300000000000000009> **Argentum III** in **2 merits**',
				'',
				'You have **12 merits** total.'
			].join('\n')
		);
	});

	it('keeps the legacy next line when the next badge has no role yet', async () => {
		const member = createMember();
		const ferrumToArgentum = createMeritBadgeRoleMap(new Map([1, 2, 3, 4, 5, 6, 7, 8].map((tier) => [tier, `${100000000000000000 + tier}`])));

		await expect(notify({ member, previousTotalMerits: 10, currentTotalMerits: 12, badgeRoles: ferrumToArgentum })).resolves.toBe(true);

		expect(member.user.send).toHaveBeenCalledWith(
			[
				"Congratulations, Legionnaire! You've earned the **Argentum II** merit badge!",
				'',
				'Your badge: **Argentum II**',
				'Next rank level in **6 merits**.',
				'',
				'You have **12 merits** total.'
			].join('\n')
		);
	});

	it('sends no DM when the badge does not change, even if the legacy level does', async () => {
		const member = createMember();

		// 12 is legacy level 4 (from 11 at level 3), but both totals hold Argentum II.
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
	badgeEmojis?: ReturnType<typeof createMeritBadgeEmojiMap>;
}) {
	return notifyMeritRankUp({
		// Explicit so these tests never depend on emoji IDs in the real environment.
		badgeEmojis: createMeritBadgeEmojiMap(new Map()),
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
