import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createInteractionResponder: vi.fn(),
	resolveConfiguredGuild: vi.fn(),
	resolveInteractionActor: vi.fn(),
	getMeritRankBreakdown: vi.fn(),
	buildMeritRankListPayload: vi.fn(),
	allBadgeRolesConfigured: false
}));

vi.mock('../../../../../src/config/env/discord', () => ({
	ENV_MERIT_BADGE_ROLES: {
		get configuredRoles() {
			return Array.from({ length: mocks.allBadgeRolesConfigured ? 36 : 6 });
		}
	}
}));

vi.mock('../../../../../src/lib/discord/interactions/interactionResponder', () => ({
	createInteractionResponder: mocks.createInteractionResponder
}));

vi.mock('../../../../../src/lib/discord/interactions/interactionPreflight', () => ({
	resolveConfiguredGuild: mocks.resolveConfiguredGuild,
	resolveInteractionActor: mocks.resolveInteractionActor
}));

vi.mock('../../../../../src/integrations/prisma/repositories', () => ({
	meritRepository: {
		getMeritRankBreakdown: mocks.getMeritRankBreakdown
	}
}));

vi.mock('../../../../../src/lib/features/merit/rank-list/buildMeritRankListPayload', () => ({
	buildMeritRankListPayload: mocks.buildMeritRankListPayload
}));

import { handleMeritRankList, handleMeritRankListPageButton } from '../../../../../src/lib/features/merit/rank-list/handleMeritRankList';

describe('handleMeritRankList', () => {
	beforeEach(() => {
		mocks.createInteractionResponder.mockReset();
		mocks.resolveConfiguredGuild.mockReset();
		mocks.resolveInteractionActor.mockReset();
		mocks.getMeritRankBreakdown.mockReset();
		mocks.buildMeritRankListPayload.mockReset();
		mocks.allBadgeRolesConfigured = false;
	});

	it('requires staff before loading the initial merit rank list', async () => {
		const responder = createResponder();
		const logger = createLogger();
		const entries = [{ rankLevel: 1 }];
		const payload = { content: 'rank list payload' };

		mocks.createInteractionResponder.mockReturnValue(responder);
		mocks.resolveConfiguredGuild.mockResolvedValue({ id: 'guild-1' });
		mocks.resolveInteractionActor.mockResolvedValue({
			actor: {
				discordUserId: 'staff-1',
				dbUserId: null,
				capabilities: {
					isStaff: true,
					isCenturion: false,
					isOptio: false
				}
			}
		});
		mocks.getMeritRankBreakdown.mockResolvedValue(entries);
		mocks.buildMeritRankListPayload.mockReturnValue(payload);

		await handleMeritRankList({
			interaction: createChatInputInteraction(false),
			context: createContext(logger)
		});

		expect(mocks.resolveInteractionActor).toHaveBeenCalledWith(
			expect.objectContaining({
				guild: { id: 'guild-1' },
				discordUserId: 'staff-1',
				capabilityRequirement: 'staff',
				unauthorizedMessage: 'Only staff can use this command.'
			})
		);
		expect(responder.deferReply).toHaveBeenCalledWith({
			flags: MessageFlags.Ephemeral
		});
		expect(mocks.getMeritRankBreakdown).toHaveBeenCalledWith({ ladder: 'legacy' });
		expect(mocks.buildMeritRankListPayload).toHaveBeenCalledWith({
			entries,
			page: 1,
			ladder: 'legacy'
		});
		expect(responder.safeEditReply).toHaveBeenCalledWith(payload);
	});

	it('counts by badge tier once every badge role is configured, for the first view and for pages', async () => {
		const responder = createResponder();
		const logger = createLogger();
		const entries = [{ level: 1 }];
		const payload = { content: 'badge list payload' };

		mocks.allBadgeRolesConfigured = true;
		mocks.createInteractionResponder.mockReturnValue(responder);
		mocks.resolveConfiguredGuild.mockResolvedValue({ id: 'guild-1' });
		mocks.resolveInteractionActor.mockResolvedValue({ actor: { discordUserId: 'staff-1' } });
		mocks.getMeritRankBreakdown.mockResolvedValue(entries);
		mocks.buildMeritRankListPayload.mockReturnValue(payload);

		await handleMeritRankList({
			interaction: createChatInputInteraction(false),
			context: createContext(logger)
		});
		await handleMeritRankListPageButton({
			interaction: createButtonInteraction(),
			parsedMeritRankListButton: {
				action: 'page',
				page: 5
			},
			context: createContext(logger)
		});

		expect(mocks.getMeritRankBreakdown).toHaveBeenNthCalledWith(1, { ladder: 'badge' });
		expect(mocks.getMeritRankBreakdown).toHaveBeenNthCalledWith(2, { ladder: 'badge' });
		expect(mocks.buildMeritRankListPayload).toHaveBeenNthCalledWith(1, { entries, page: 1, ladder: 'badge' });
		expect(mocks.buildMeritRankListPayload).toHaveBeenNthCalledWith(2, { entries, page: 5, ladder: 'badge' });
	});

	it('does not paginate the merit rank list for non-staff users', async () => {
		const responder = createResponder();
		const logger = createLogger();

		mocks.createInteractionResponder.mockReturnValue(responder);
		mocks.resolveConfiguredGuild.mockResolvedValue({ id: 'guild-1' });
		mocks.resolveInteractionActor.mockResolvedValue(null);

		await handleMeritRankListPageButton({
			interaction: createButtonInteraction(),
			parsedMeritRankListButton: {
				action: 'page',
				page: 2
			},
			context: createContext(logger)
		});

		expect(mocks.resolveInteractionActor).toHaveBeenCalledWith(
			expect.objectContaining({
				guild: { id: 'guild-1' },
				discordUserId: 'staff-1',
				capabilityRequirement: 'staff',
				unauthorizedMessage: 'Only staff can use this command.'
			})
		);
		expect(responder.deferUpdate).not.toHaveBeenCalled();
		expect(mocks.getMeritRankBreakdown).not.toHaveBeenCalled();
		expect(responder.safeEditReply).not.toHaveBeenCalled();
	});
});

function createContext(logger = createLogger()) {
	return {
		requestId: 'req-1',
		logger: {
			child: vi.fn(() => logger)
		}
	} as never;
}

function createLogger() {
	return {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn()
	};
}

function createResponder() {
	return {
		deferReply: vi.fn().mockResolvedValue(undefined),
		deferUpdate: vi.fn().mockResolvedValue(true),
		safeEditReply: vi.fn().mockResolvedValue(undefined),
		fail: vi.fn().mockResolvedValue(undefined)
	};
}

function createChatInputInteraction(isPublic: boolean) {
	return {
		user: {
			id: 'staff-1'
		},
		options: {
			getBoolean: vi.fn(() => isPublic)
		}
	} as never;
}

function createButtonInteraction() {
	return {
		user: {
			id: 'staff-1'
		}
	} as never;
}
