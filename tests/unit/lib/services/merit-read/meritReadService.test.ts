import { describe, expect, it, vi } from 'vitest';

import { loadInitialMeritList, loadMeritListPage, type MeritReadMember } from '../../../../../src/lib/services/merit-read/meritReadService';

describe('meritReadService', () => {
	it('loads the requester merit summary when no explicit target is provided', async () => {
		const deps = createDeps();
		const requesterMember = buildMember('requester-user', 'Requester');

		await expect(
			loadInitialMeritList(deps, {
				actor: createActor(),
				requesterMember,
				requestedTargetDiscordUserId: null,
				requestedPrivate: null,
				pageSize: 5
			})
		).resolves.toEqual({
			kind: 'loaded',
			targetMember: requesterMember,
			summary: buildSummary(),
			shouldReplyPrivately: true
		});
		expect(deps.getMember).not.toHaveBeenCalled();
	});

	it('blocks non-staff users from loading another member summary', async () => {
		const deps = createDeps();

		await expect(
			loadInitialMeritList(deps, {
				actor: createActor({
					isStaff: false
				}),
				requesterMember: buildMember('requester-user', 'Requester'),
				requestedTargetDiscordUserId: 'target-user',
				requestedPrivate: false,
				pageSize: 5
			})
		).resolves.toEqual({
			kind: 'forbidden_other_user'
		});
		expect(deps.getMember).not.toHaveBeenCalled();
	});

	it('returns target_not_found when the selected target is missing or a bot', async () => {
		const missingDeps = createDeps({
			getMemberResult: null
		});

		await expect(
			loadInitialMeritList(missingDeps, {
				actor: createActor(),
				requesterMember: buildMember('requester-user', 'Requester'),
				requestedTargetDiscordUserId: 'missing-user',
				requestedPrivate: true,
				pageSize: 5
			})
		).resolves.toEqual({
			kind: 'target_not_found'
		});

		const botDeps = createDeps({
			getMemberResult: buildMember('bot-user', 'Helper Bot', true)
		});

		await expect(
			loadInitialMeritList(botDeps, {
				actor: createActor(),
				requesterMember: buildMember('requester-user', 'Requester'),
				requestedTargetDiscordUserId: 'bot-user',
				requestedPrivate: true,
				pageSize: 5
			})
		).resolves.toEqual({
			kind: 'target_not_found'
		});
	});

	it('returns an empty summary when the target is not in the user table', async () => {
		const deps = createDeps({
			getUserResult: null
		});
		const targetMember = buildMember('target-user', 'Target');

		await expect(
			loadInitialMeritList(deps, {
				actor: createActor(),
				requesterMember: buildMember('requester-user', 'Requester'),
				requestedTargetDiscordUserId: 'target-user',
				requestedPrivate: false,
				pageSize: 5
			})
		).resolves.toEqual({
			kind: 'loaded',
			targetMember,
			summary: {
				totalMerits: 0,
				totalAwards: 0,
				totalLinkedEvents: 0,
				page: 1,
				pageSize: 5,
				totalPages: 1,
				entries: []
			},
			shouldReplyPrivately: false
		});
		expect(deps.getUserMeritSummary).not.toHaveBeenCalled();
	});

	it('loads arbitrary pages for pagination requests', async () => {
		const deps = createDeps({
			getMemberResult: buildMember('target-user', 'Target'),
			getUserMeritSummaryResult: buildSummary({
				page: 3,
				totalPages: 7
			})
		});

		await expect(
			loadMeritListPage(deps, {
				targetDiscordUserId: 'target-user',
				page: 3,
				pageSize: 5
			})
		).resolves.toEqual({
			kind: 'loaded',
			targetMember: buildMember('target-user', 'Target'),
			summary: buildSummary({
				page: 3,
				totalPages: 7
			})
		});
		expect(deps.getUserMeritSummary).toHaveBeenCalledWith({
			userDbUserId: 'db-user-id',
			page: 3,
			pageSize: 5
		});
	});
});

function createActor({ isStaff = true }: { isStaff?: boolean } = {}) {
	return {
		discordUserId: 'requester-user',
		dbUserId: 'requester-db-user',
		capabilities: {
			isStaff,
			isCenturion: false
		}
	};
}

function createDeps({
	getMemberResult = buildMember('target-user', 'Target'),
	getUserResult = { id: 'db-user-id' },
	getUserMeritSummaryResult = buildSummary()
}: {
	getMemberResult?: MeritReadMember | null;
	getUserResult?: { id: string } | null;
	getUserMeritSummaryResult?: ReturnType<typeof buildSummary>;
} = {}) {
	return {
		getMember: vi.fn().mockResolvedValue(getMemberResult),
		getUser: vi.fn().mockResolvedValue(getUserResult),
		getUserMeritSummary: vi.fn().mockResolvedValue(getUserMeritSummaryResult)
	};
}

function buildMember(discordUserId: string, displayName: string, isBot = false): MeritReadMember {
	return {
		discordUserId,
		displayName,
		isBot
	};
}

function buildSummary({
	page = 1,
	totalPages = 2
}: {
	page?: number;
	totalPages?: number;
} = {}) {
	return {
		totalMerits: 12,
		totalAwards: 4,
		totalLinkedEvents: 2,
		page,
		pageSize: 5,
		totalPages,
		entries: []
	};
}
