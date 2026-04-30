import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	prepareGuildInteraction: vi.fn(),
	parseDiscordUserIdInput: vi.fn(),
	userMigrationRepository: {
		purgeByDiscordUserId: vi.fn()
	}
}));

vi.mock('../../../../../../src/lib/discord/interactions/prepareGuildInteraction', () => ({
	prepareGuildInteraction: mocks.prepareGuildInteraction
}));

vi.mock('../../../../../../src/lib/discord/members/memberDirectory', () => ({
	parseDiscordUserIdInput: mocks.parseDiscordUserIdInput
}));

vi.mock('../../../../../../src/integrations/prisma/repositories', () => ({
	userMigrationRepository: mocks.userMigrationRepository
}));

import { handleStaffUserPurge } from '../../../../../../src/lib/features/staff/user-migration/handleStaffUserPurge';

describe('handleStaffUserPurge', () => {
	beforeEach(() => {
		mocks.prepareGuildInteraction.mockReset();
		mocks.parseDiscordUserIdInput.mockReset();
		mocks.userMigrationRepository.purgeByDiscordUserId.mockReset();
	});

	it('rejects invalid user_id input', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue(undefined);

		await handleStaffUserPurge({
			interaction: createInteraction({
				user_id: 'bad'
			}),
			context: createContext('req-1') as never
		});

		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: 'Invalid `user_id` value. Provide a Discord user ID or mention. requestId=`req-1`'
		});
	});

	it('reports blocking references instead of deleting the user', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue('100000000000000000');
		mocks.userMigrationRepository.purgeByDiscordUserId.mockResolvedValue({
			kind: 'references_remaining',
			user: {
				dbUserId: 'old-db',
				discordUserId: '100000000000000000'
			},
			referenceCounts: {
				divisionMemberships: 1,
				nameChangeRequestsRequested: 2,
				nameChangeRequestsReviewed: 3,
				meritsReceived: 4,
				meritsAwarded: 5,
				hostedEvents: 6,
				finalizedEvents: 7,
				eventChannelsAdded: 8,
				participantStats: 9,
				reviewDecisions: 10
			}
		});

		await handleStaffUserPurge({
			interaction: createInteraction({
				user_id: '100000000000000000'
			}),
			context: createContext('req-2') as never
		});

		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: expect.stringContaining('Cannot purge <@100000000000000000> because user-linked records still remain.')
		});
	});

	it('deletes the user row once no references remain', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue('100000000000000000');
		mocks.userMigrationRepository.purgeByDiscordUserId.mockResolvedValue({
			kind: 'purged',
			user: {
				dbUserId: 'old-db',
				discordUserId: '100000000000000000'
			}
		});

		await handleStaffUserPurge({
			interaction: createInteraction({
				user_id: '100000000000000000'
			}),
			context: createContext('req-3') as never
		});

		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: 'Deleted the old user row for <@100000000000000000> after confirming no references remained. requestId=`req-3`'
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

function createInteraction(values: { user_id: string }) {
	return {
		options: {
			getString: vi.fn((name: string, required?: boolean) => {
				if (name === 'user_id') return values.user_id;
				if (required) {
					throw new Error(`Unexpected required option: ${name}`);
				}
				return null;
			})
		}
	} as never;
}

function createContext(requestId: string) {
	return {
		requestId,
		logger: {
			child: vi.fn(() => ({
				trace: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn()
			}))
		}
	};
}
