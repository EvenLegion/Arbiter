import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	resolveAutocompleteGuild: vi.fn(),
	resolveAutocompleteRequester: vi.fn(),
	respondWithAutocompleteChoices: vi.fn(),
	respondWithEmptyAutocompleteChoices: vi.fn(),
	buildMeritExistingEventChoices: vi.fn(),
	buildManualMeritTypeChoices: vi.fn(),
	buildMeritMemberChoices: vi.fn()
}));

vi.mock('../../../../../src/lib/discord/autocompleteResponder', () => ({
	resolveAutocompleteGuild: mocks.resolveAutocompleteGuild,
	resolveAutocompleteRequester: mocks.resolveAutocompleteRequester,
	respondWithAutocompleteChoices: mocks.respondWithAutocompleteChoices,
	respondWithEmptyAutocompleteChoices: mocks.respondWithEmptyAutocompleteChoices
}));

vi.mock('../../../../../src/lib/features/merit/autocomplete/meritAutocompleteChoices', () => ({
	buildMeritExistingEventChoices: mocks.buildMeritExistingEventChoices,
	buildManualMeritTypeChoices: mocks.buildManualMeritTypeChoices,
	buildMeritMemberChoices: mocks.buildMeritMemberChoices
}));

import { handleMeritAutocomplete } from '../../../../../src/lib/features/merit/autocomplete/meritAutocompleteProvider';

describe('meritAutocompleteProvider', () => {
	beforeEach(() => {
		mocks.resolveAutocompleteGuild.mockReset();
		mocks.resolveAutocompleteRequester.mockReset();
		mocks.respondWithAutocompleteChoices.mockReset();
		mocks.respondWithEmptyAutocompleteChoices.mockReset();
		mocks.buildMeritExistingEventChoices.mockReset();
		mocks.buildManualMeritTypeChoices.mockReset();
		mocks.buildMeritMemberChoices.mockReset();
	});

	it('returns an empty response for unsupported subcommands', async () => {
		const interaction = createInteraction({
			subcommandName: 'summary',
			focusedName: 'user_name',
			focusedValue: 'abc',
			userId: '42'
		});

		await handleMeritAutocomplete({
			interaction
		});

		expect(mocks.respondWithEmptyAutocompleteChoices).toHaveBeenCalledWith(interaction);
		expect(mocks.resolveAutocompleteGuild).not.toHaveBeenCalled();
	});

	it('routes staff event lookup through the existing-event option builder', async () => {
		const guild = {
			id: 'guild-1'
		};
		mocks.resolveAutocompleteGuild.mockResolvedValue(guild);
		mocks.resolveAutocompleteRequester.mockResolvedValue({
			member: {
				id: '42',
				displayName: 'Requester'
			},
			isStaff: true
		});
		mocks.buildMeritExistingEventChoices.mockResolvedValue([
			{
				name: 'Today | Event',
				value: '11'
			}
		]);
		const interaction = createInteraction({
			subcommandName: 'give',
			focusedName: 'existing_event',
			focusedValue: 'event',
			userId: '42'
		});

		await handleMeritAutocomplete({
			interaction
		});

		expect(mocks.resolveAutocompleteRequester).toHaveBeenCalledWith({
			guild,
			discordUserId: '42'
		});
		expect(mocks.buildMeritExistingEventChoices).toHaveBeenCalledWith({
			query: 'event'
		});
		expect(mocks.respondWithAutocompleteChoices).toHaveBeenCalledWith(
			expect.objectContaining({
				interaction,
				choices: [
					{
						name: 'Today | Event',
						value: '11'
					}
				]
			})
		);
	});

	it('limits non-staff list lookups to the requester identity', async () => {
		const guild = {
			id: 'guild-1'
		};
		mocks.resolveAutocompleteGuild.mockResolvedValue(guild);
		mocks.resolveAutocompleteRequester.mockResolvedValue({
			member: {
				id: '42',
				displayName: 'Requester Name'
			},
			isStaff: false
		});
		const interaction = createInteraction({
			subcommandName: 'list',
			focusedName: 'player_name',
			focusedValue: '',
			userId: '42'
		});

		await handleMeritAutocomplete({
			interaction
		});

		expect(mocks.respondWithAutocompleteChoices).toHaveBeenCalledWith(
			expect.objectContaining({
				interaction,
				choices: [
					{
						name: 'Requester Name',
						value: '42'
					}
				]
			})
		);
		expect(mocks.buildMeritMemberChoices).not.toHaveBeenCalled();
	});

	it('blocks non-staff give autocomplete before member search', async () => {
		const guild = {
			id: 'guild-1'
		};
		mocks.resolveAutocompleteGuild.mockResolvedValue(guild);
		mocks.resolveAutocompleteRequester.mockResolvedValue({
			member: {
				id: '42',
				displayName: 'Requester Name'
			},
			isStaff: false
		});
		const interaction = createInteraction({
			subcommandName: 'give',
			focusedName: 'user_name',
			focusedValue: 'abc',
			userId: '42'
		});

		await handleMeritAutocomplete({
			interaction
		});

		expect(mocks.respondWithEmptyAutocompleteChoices).toHaveBeenCalledWith(interaction);
		expect(mocks.buildMeritMemberChoices).not.toHaveBeenCalled();
	});
});

function createInteraction({
	subcommandName,
	focusedName,
	focusedValue,
	userId
}: {
	subcommandName: string | null;
	focusedName: string;
	focusedValue: string;
	userId: string;
}) {
	return {
		user: {
			id: userId
		},
		options: {
			getFocused: vi.fn(() => ({
				name: focusedName,
				value: focusedValue
			})),
			getSubcommand: vi.fn(() => subcommandName)
		}
	} as never;
}
