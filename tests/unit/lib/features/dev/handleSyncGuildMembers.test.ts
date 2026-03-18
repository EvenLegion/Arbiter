import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	syncGuildMembers: vi.fn(),
	createGuildMemberSyncDeps: vi.fn(),
	buildGuildMemberSyncPayload: vi.fn(),
	prepareDevGuildCommand: vi.fn()
}));

vi.mock('../../../../../src/lib/services/guild-member-sync/guildMemberSyncService', () => ({
	syncGuildMembers: mocks.syncGuildMembers
}));

vi.mock('../../../../../src/lib/services/guild-member-sync/createGuildMemberSyncDeps', () => ({
	createGuildMemberSyncDeps: mocks.createGuildMemberSyncDeps
}));

vi.mock('../../../../../src/lib/features/dev/presenters/buildGuildMemberSyncPayload', () => ({
	buildGuildMemberSyncPayload: mocks.buildGuildMemberSyncPayload
}));

vi.mock('../../../../../src/lib/features/dev/handlers/prepareDevGuildCommand', () => ({
	prepareDevGuildCommand: mocks.prepareDevGuildCommand
}));

import { handleSyncGuildMembers } from '../../../../../src/lib/features/dev/handlers/handleSyncGuildMembers';

describe('handleSyncGuildMembers', () => {
	beforeEach(() => {
		mocks.syncGuildMembers.mockReset();
		mocks.createGuildMemberSyncDeps.mockReset();
		mocks.buildGuildMemberSyncPayload.mockReset();
		mocks.prepareDevGuildCommand.mockReset();
	});

	it('fails the interaction when division refresh fails', async () => {
		const prepared = createPrepared();
		mocks.prepareDevGuildCommand.mockResolvedValue(prepared);
		mocks.createGuildMemberSyncDeps.mockReturnValue({
			deps: true
		});
		mocks.syncGuildMembers.mockResolvedValue({
			kind: 'division_cache_refresh_failed',
			errorMessage: 'refresh failed'
		});

		await handleSyncGuildMembers({
			interaction: {} as never,
			context: {
				requestId: 'req-1'
			} as never
		});

		expect(mocks.syncGuildMembers).toHaveBeenCalledWith({
			deps: true
		});
		expect(prepared.logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: 'division_cache_refresh_failed'
			}),
			'guild_member.sync.failed'
		);
		expect(prepared.responder.fail).toHaveBeenCalledWith('Failed to refresh division cache.', {
			requestId: true
		});
	});

	it('replies with the built payload after a completed sync', async () => {
		const prepared = createPrepared();
		const context = {
			requestId: 'req-2'
		};
		mocks.prepareDevGuildCommand.mockResolvedValue(prepared);
		mocks.createGuildMemberSyncDeps.mockReturnValue({
			deps: true
		});
		mocks.syncGuildMembers.mockResolvedValue({
			kind: 'completed',
			totalMembers: 2,
			botMembersSkipped: 0,
			usersUpserted: 2,
			membershipSyncSucceeded: 2,
			nicknameComputed: 2,
			nicknameUpdated: 1,
			nicknameUnchanged: 1,
			failedMembers: []
		});
		mocks.buildGuildMemberSyncPayload.mockReturnValue({
			embeds: []
		});

		await handleSyncGuildMembers({
			interaction: {} as never,
			context: context as never
		});

		expect(mocks.createGuildMemberSyncDeps).toHaveBeenCalledWith({
			guild: prepared.guild,
			context
		});
		expect(prepared.logger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: 'completed',
				totalMembers: 2
			}),
			'guild_member.sync.completed'
		);
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			embeds: []
		});
	});
});

function createPrepared() {
	return {
		guild: {
			id: 'guild-1'
		},
		logger: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn()
		},
		responder: {
			safeEditReply: vi.fn().mockResolvedValue(undefined),
			fail: vi.fn().mockResolvedValue(undefined)
		}
	};
}
