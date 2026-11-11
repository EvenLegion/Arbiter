import type { Guild } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { syncAwardedMemberBadges } from '../../../../../src/lib/features/event-merit/gateways/awardedMemberBadgeSyncGateway';
import { createMockExecutionContext, createMockLogger } from '../../../../support/logger';

const GUILD = { id: 'test-guild-id' } as unknown as Guild;

describe('syncAwardedMemberBadges', () => {
	it('syncs each awarded member once with a fresh total read (no override)', async () => {
		const syncMember = vi.fn().mockResolvedValueOnce({ kind: 'updated' }).mockResolvedValueOnce({ kind: 'unchanged' });
		const createRuntime = vi.fn().mockReturnValue({ syncMember });
		const logger = createMockLogger();

		await syncAwardedMemberBadges({
			guild: GUILD,
			awardedUsers: [{ discordUserId: 'a' }, { discordUserId: 'b' }, { discordUserId: 'a' }],
			context: createMockExecutionContext({ logger }),
			logger,
			createRuntime,
			now: vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(1_250)
		});

		// A missing batch total can never become 0: the service reads each total inside the member lock.
		expect(syncMember.mock.calls).toEqual([[{ discordUserId: 'a' }], [{ discordUserId: 'b' }]]);
		expect(logger.info).toHaveBeenCalledWith(
			{ memberCount: 2, updatedCount: 1, failedCount: 0, durationMs: 250 },
			'event.review.merit_badge_sync.completed'
		);
	});

	it('keeps going after a failed member and logs a warning summary', async () => {
		const syncMember = vi
			.fn()
			.mockResolvedValueOnce({ kind: 'failed', stage: 'add_role', code: 'missing_permissions' })
			.mockResolvedValueOnce({ kind: 'updated' });
		const logger = createMockLogger();

		await syncAwardedMemberBadges({
			guild: GUILD,
			awardedUsers: [{ discordUserId: 'a' }, { discordUserId: 'b' }],
			context: createMockExecutionContext({ logger }),
			logger,
			createRuntime: () => ({ syncMember }),
			now: () => 0
		});

		expect(syncMember).toHaveBeenCalledTimes(2);
		expect(logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({ memberCount: 2, updatedCount: 1, failedCount: 1 }),
			'event.review.merit_badge_sync.completed_with_failures'
		);
	});

	it('stops after the first member while badges are disabled', async () => {
		const syncMember = vi.fn().mockResolvedValue({ kind: 'disabled' });
		const logger = createMockLogger();

		await syncAwardedMemberBadges({
			guild: GUILD,
			awardedUsers: [{ discordUserId: 'a' }, { discordUserId: 'b' }],
			context: createMockExecutionContext({ logger }),
			logger,
			createRuntime: () => ({ syncMember })
		});

		expect(syncMember).toHaveBeenCalledTimes(1);
		expect(logger.info).not.toHaveBeenCalled();
	});

	it('never throws', async () => {
		const logger = createMockLogger();

		await expect(
			syncAwardedMemberBadges({
				guild: GUILD,
				awardedUsers: [{ discordUserId: 'a' }],
				context: createMockExecutionContext({ logger }),
				logger,
				createRuntime: () => ({ syncMember: vi.fn().mockRejectedValue(new Error('boom')) })
			})
		).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ memberCount: 1 }), 'event.review.merit_badge_sync.failed');
	});

	it('does nothing when nobody was awarded', async () => {
		const createRuntime = vi.fn();
		const logger = createMockLogger();

		await syncAwardedMemberBadges({
			guild: GUILD,
			awardedUsers: [],
			context: createMockExecutionContext({ logger }),
			logger,
			createRuntime
		});

		expect(createRuntime).not.toHaveBeenCalled();
	});
});
