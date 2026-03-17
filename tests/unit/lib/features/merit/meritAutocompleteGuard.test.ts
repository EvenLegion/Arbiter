import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	resolveAutocompleteGuild: vi.fn(),
	resolveAutocompleteRequester: vi.fn(),
	respondWithEmptyAutocompleteChoices: vi.fn(),
	respondWithQueryAutocompleteChoices: vi.fn()
}));

vi.mock('../../../../../src/lib/discord/autocompleteResponder', () => ({
	resolveAutocompleteGuild: mocks.resolveAutocompleteGuild,
	resolveAutocompleteRequester: mocks.resolveAutocompleteRequester,
	respondWithEmptyAutocompleteChoices: mocks.respondWithEmptyAutocompleteChoices
}));

vi.mock('../../../../../src/lib/discord/autocompleteRouteHelpers', async () => {
	const actual = await vi.importActual<typeof import('../../../../../src/lib/discord/autocompleteRouteHelpers')>(
		'../../../../../src/lib/discord/autocompleteRouteHelpers'
	);

	return {
		...actual,
		respondWithQueryAutocompleteChoices: mocks.respondWithQueryAutocompleteChoices
	};
});

import {
	resolveMeritAutocompleteQuery,
	resolveMeritMemberAutocompleteAccess,
	resolveMeritStaffAutocompleteContext,
	respondWithRequesterSelfChoice
} from '../../../../../src/lib/features/merit/autocomplete/meritAutocompleteGuard';

describe('meritAutocompleteGuard', () => {
	beforeEach(() => {
		mocks.resolveAutocompleteGuild.mockReset();
		mocks.resolveAutocompleteRequester.mockReset();
		mocks.respondWithEmptyAutocompleteChoices.mockReset();
		mocks.respondWithQueryAutocompleteChoices.mockReset();
	});

	it('returns trimmed autocomplete queries', () => {
		expect(resolveMeritAutocompleteQuery('  user-42  ')).toBe('user-42');
	});

	it('returns staff autocomplete context for staff requesters', async () => {
		const guild = {
			id: 'guild-1'
		};
		const requester = {
			member: {
				id: '42'
			},
			isStaff: true
		};
		mocks.resolveAutocompleteGuild.mockResolvedValue(guild);
		mocks.resolveAutocompleteRequester.mockResolvedValue(requester);
		const interaction = createInteraction('42');

		const result = await resolveMeritStaffAutocompleteContext({
			interaction,
			loggerContext: {
				commandName: 'merit',
				subcommandName: 'give',
				focusedOptionName: 'existing_event'
			},
			logMessage: 'failed'
		});

		expect(result).toEqual({
			guild,
			requester
		});
		expect(mocks.respondWithEmptyAutocompleteChoices).not.toHaveBeenCalled();
	});

	it('returns self-only access for non-staff merit list lookups', async () => {
		const requester = {
			member: {
				id: '42',
				displayName: 'Requester'
			},
			isStaff: false
		};
		mocks.resolveAutocompleteGuild.mockResolvedValue({
			id: 'guild-1'
		});
		mocks.resolveAutocompleteRequester.mockResolvedValue(requester);

		const result = await resolveMeritMemberAutocompleteAccess({
			interaction: createInteraction('42'),
			loggerContext: {
				commandName: 'merit',
				subcommandName: 'list',
				focusedOptionName: 'player_name'
			},
			logMessage: 'failed'
		});

		expect(result).toEqual({
			kind: 'self-only',
			requester
		});
	});

	it('blocks non-staff manual merit lookups when staff access is required', async () => {
		mocks.resolveAutocompleteGuild.mockResolvedValue({
			id: 'guild-1'
		});
		mocks.resolveAutocompleteRequester.mockResolvedValue({
			member: {
				id: '42'
			},
			isStaff: false
		});
		const interaction = createInteraction('42');

		const result = await resolveMeritMemberAutocompleteAccess({
			interaction,
			loggerContext: {
				commandName: 'merit',
				subcommandName: 'give',
				focusedOptionName: 'user_name'
			},
			logMessage: 'failed',
			forbidNonStaff: true
		});

		expect(result).toBeNull();
		expect(mocks.respondWithEmptyAutocompleteChoices).toHaveBeenCalledWith(interaction);
	});

	it('responds with the requester identity for self-only choices', async () => {
		await respondWithRequesterSelfChoice({
			interaction: createInteraction('42'),
			requester: {
				member: {
					id: '42',
					displayName: 'Requester Name'
				} as never,
				isStaff: false
			},
			loggerContext: {
				commandName: 'merit',
				subcommandName: 'list',
				focusedOptionName: 'player_name'
			},
			logMessage: 'failed'
		});

		expect(mocks.respondWithQueryAutocompleteChoices).toHaveBeenCalledWith({
			interaction: expect.any(Object),
			loggerContext: {
				commandName: 'merit',
				subcommandName: 'list',
				focusedOptionName: 'player_name'
			},
			choiceLogMessage: 'failed',
			loadChoices: expect.any(Function)
		});

		const [{ loadChoices }] = mocks.respondWithQueryAutocompleteChoices.mock.calls[0];
		await expect(loadChoices()).resolves.toEqual([
			{
				name: 'Requester Name',
				value: '42'
			}
		]);
	});
});

function createInteraction(userId: string) {
	return {
		user: {
			id: userId
		}
	} as never;
}
