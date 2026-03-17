import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	resolveAutocompleteGuild: vi.fn(),
	respondWithAutocompleteChoices: vi.fn(),
	respondWithEmptyAutocompleteChoices: vi.fn(),
	buildEventTierAutocompleteChoices: vi.fn(),
	buildEventSessionAutocompleteChoices: vi.fn(),
	buildEventVoiceChannelAutocompleteChoices: vi.fn()
}));

vi.mock('../../../../../../src/lib/discord/autocompleteResponder', () => ({
	resolveAutocompleteGuild: mocks.resolveAutocompleteGuild,
	respondWithAutocompleteChoices: mocks.respondWithAutocompleteChoices,
	respondWithEmptyAutocompleteChoices: mocks.respondWithEmptyAutocompleteChoices
}));

vi.mock('../../../../../../src/lib/features/event-merit/session/eventAutocompleteOptions', () => ({
	buildEventTierAutocompleteChoices: mocks.buildEventTierAutocompleteChoices,
	buildEventSessionAutocompleteChoices: mocks.buildEventSessionAutocompleteChoices,
	buildEventVoiceChannelAutocompleteChoices: mocks.buildEventVoiceChannelAutocompleteChoices
}));

import { handleEventAutocomplete } from '../../../../../../src/lib/features/event-merit/session/eventAutocompleteProvider';

describe('eventAutocompleteProvider', () => {
	beforeEach(() => {
		mocks.resolveAutocompleteGuild.mockReset();
		mocks.respondWithAutocompleteChoices.mockReset();
		mocks.respondWithEmptyAutocompleteChoices.mockReset();
		mocks.buildEventTierAutocompleteChoices.mockReset();
		mocks.buildEventSessionAutocompleteChoices.mockReset();
		mocks.buildEventVoiceChannelAutocompleteChoices.mockReset();
	});

	it('routes tier autocomplete through the tier option builder', async () => {
		mocks.buildEventTierAutocompleteChoices.mockResolvedValue([
			{
				name: 'Tier One',
				value: '1'
			}
		]);
		const interaction = createInteraction({
			subcommandName: 'start',
			focusedName: 'tier_level',
			focusedValue: 'tier'
		});

		await handleEventAutocomplete({
			interaction
		});

		expect(mocks.buildEventTierAutocompleteChoices).toHaveBeenCalledWith({
			query: 'tier'
		});
		expect(mocks.respondWithAutocompleteChoices).toHaveBeenCalledWith(
			expect.objectContaining({
				interaction,
				choices: [
					{
						name: 'Tier One',
						value: '1'
					}
				]
			})
		);
		expect(mocks.resolveAutocompleteGuild).not.toHaveBeenCalled();
		expect(mocks.respondWithEmptyAutocompleteChoices).not.toHaveBeenCalled();
	});

	it('routes voice channel autocomplete through guild resolution and the voice channel builder', async () => {
		const guild = {
			id: 'guild-1'
		};
		mocks.resolveAutocompleteGuild.mockResolvedValue(guild);
		mocks.buildEventVoiceChannelAutocompleteChoices.mockResolvedValue([
			{
				name: 'VC 1',
				value: 'vc-1'
			}
		]);
		const interaction = createInteraction({
			subcommandName: 'add_vc',
			focusedName: 'voice_channel',
			focusedValue: 'vc'
		});

		await handleEventAutocomplete({
			interaction
		});

		expect(mocks.resolveAutocompleteGuild).toHaveBeenCalledWith(
			expect.objectContaining({
				interaction
			})
		);
		expect(mocks.buildEventVoiceChannelAutocompleteChoices).toHaveBeenCalledWith({
			guild,
			query: 'vc'
		});
		expect(mocks.respondWithAutocompleteChoices).toHaveBeenCalledWith(
			expect.objectContaining({
				interaction,
				choices: [
					{
						name: 'VC 1',
						value: 'vc-1'
					}
				]
			})
		);
	});

	it('returns an empty autocomplete response for unsupported option branches', async () => {
		const interaction = createInteraction({
			subcommandName: 'start',
			focusedName: 'event_name',
			focusedValue: 'ignored'
		});

		await handleEventAutocomplete({
			interaction
		});

		expect(mocks.respondWithEmptyAutocompleteChoices).toHaveBeenCalledWith(interaction);
		expect(mocks.respondWithAutocompleteChoices).not.toHaveBeenCalled();
	});
});

function createInteraction({
	subcommandName,
	focusedName,
	focusedValue,
	responded = false
}: {
	subcommandName: string | null;
	focusedName: string;
	focusedValue: string;
	responded?: boolean;
}) {
	return {
		responded,
		options: {
			getFocused: vi.fn(() => ({
				name: focusedName,
				value: focusedValue
			})),
			getSubcommand: vi.fn(() => subcommandName)
		}
	} as never;
}
