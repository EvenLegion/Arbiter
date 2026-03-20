import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getConfiguredGuild: vi.fn(),
	buildEventTierAutocompleteChoices: vi.fn(),
	buildEventSessionAutocompleteChoices: vi.fn(),
	buildEventVoiceChannelAutocompleteChoices: vi.fn()
}));

vi.mock('../../../../../../src/lib/discord/guild/configuredGuild', () => ({
	getConfiguredGuild: mocks.getConfiguredGuild
}));

vi.mock('../../../../../../src/lib/features/event-merit/session/autocomplete/eventAutocompleteChoices', () => ({
	buildEventTierAutocompleteChoices: mocks.buildEventTierAutocompleteChoices,
	buildEventSessionAutocompleteChoices: mocks.buildEventSessionAutocompleteChoices,
	buildEventVoiceChannelAutocompleteChoices: mocks.buildEventVoiceChannelAutocompleteChoices
}));

import { handleEventAutocomplete } from '../../../../../../src/lib/features/event-merit/session/autocomplete/eventAutocompleteProvider';

describe('eventAutocompleteProvider', () => {
	beforeEach(() => {
		mocks.getConfiguredGuild.mockReset();
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
		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: 'Tier One',
				value: '1'
			}
		]);
		expect(mocks.getConfiguredGuild).not.toHaveBeenCalled();
	});

	it('routes voice channel autocomplete through guild resolution and the voice channel builder', async () => {
		const guild = {
			id: 'guild-1'
		};
		mocks.getConfiguredGuild.mockResolvedValue(guild);
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

		expect(mocks.getConfiguredGuild).toHaveBeenCalledTimes(1);
		expect(mocks.buildEventVoiceChannelAutocompleteChoices).toHaveBeenCalledWith({
			guild,
			query: 'vc'
		});
		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: 'VC 1',
				value: 'vc-1'
			}
		]);
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

		expect(interaction.respond).toHaveBeenCalledWith([]);
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
		respond: vi.fn().mockResolvedValue(undefined),
		options: {
			getFocused: vi.fn(() => ({
				name: focusedName,
				value: focusedValue
			})),
			getSubcommand: vi.fn(() => subcommandName)
		}
	} as never;
}
