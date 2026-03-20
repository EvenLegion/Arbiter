import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getConfiguredGuild: vi.fn(),
	buildGuildMemberAutocompleteChoices: vi.fn(),
	buildDivisionAutocompleteChoices: vi.fn()
}));

vi.mock('../../../../../../src/lib/discord/guild/configuredGuild', () => ({
	getConfiguredGuild: mocks.getConfiguredGuild
}));

vi.mock('../../../../../../src/lib/discord/members/memberDirectory', () => ({
	buildGuildMemberAutocompleteChoices: mocks.buildGuildMemberAutocompleteChoices
}));

vi.mock('../../../../../../src/lib/services/division-membership/divisionDirectory', () => ({
	buildDivisionAutocompleteChoices: mocks.buildDivisionAutocompleteChoices
}));

import { handleStaffAutocomplete } from '../../../../../../src/lib/features/staff/autocomplete/staffAutocompleteProvider';

describe('staffAutocompleteProvider', () => {
	beforeEach(() => {
		mocks.getConfiguredGuild.mockReset();
		mocks.buildGuildMemberAutocompleteChoices.mockReset();
		mocks.buildDivisionAutocompleteChoices.mockReset();
	});

	it('routes sync nickname user lookup through the guild member directory', async () => {
		const guild = {
			id: 'guild-1'
		};
		mocks.getConfiguredGuild.mockResolvedValue(guild);
		mocks.buildGuildMemberAutocompleteChoices.mockResolvedValue([
			{
				name: 'Member One',
				value: 'member-1'
			}
		]);
		const interaction = createInteraction({
			subcommandGroupName: null,
			subcommandName: 'sync_nickname',
			focusedName: 'user',
			focusedValue: 'mem'
		});

		await handleStaffAutocomplete({
			interaction
		});

		expect(mocks.getConfiguredGuild).toHaveBeenCalledTimes(1);
		expect(mocks.buildGuildMemberAutocompleteChoices).toHaveBeenCalledWith({
			guild,
			query: 'mem'
		});
		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: 'Member One',
				value: 'member-1'
			}
		]);
	});

	it('routes division membership division lookup through the division directory', async () => {
		mocks.buildDivisionAutocompleteChoices.mockResolvedValue([
			{
				name: 'Navy',
				value: 'NVY'
			}
		]);
		const interaction = createInteraction({
			subcommandGroupName: 'division_membership',
			subcommandName: 'add',
			focusedName: 'division_name',
			focusedValue: 'nav'
		});

		await handleStaffAutocomplete({
			interaction
		});

		expect(mocks.buildDivisionAutocompleteChoices).toHaveBeenCalledWith({
			query: 'nav'
		});
		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: 'Navy',
				value: 'NVY'
			}
		]);
		expect(mocks.getConfiguredGuild).not.toHaveBeenCalled();
	});

	it('returns an empty response for unrelated staff options', async () => {
		const interaction = createInteraction({
			subcommandGroupName: null,
			subcommandName: 'sync_nickname',
			focusedName: 'reason',
			focusedValue: 'ignored'
		});

		await handleStaffAutocomplete({
			interaction
		});

		expect(interaction.respond).toHaveBeenCalledWith([]);
	});
});

function createInteraction({
	subcommandGroupName,
	subcommandName,
	focusedName,
	focusedValue
}: {
	subcommandGroupName: string | null;
	subcommandName: string | null;
	focusedName: string;
	focusedValue: string;
}) {
	return {
		respond: vi.fn().mockResolvedValue(undefined),
		options: {
			getSubcommandGroup: vi.fn(() => subcommandGroupName),
			getSubcommand: vi.fn(() => subcommandName),
			getFocused: vi.fn((withMetadata?: boolean) =>
				withMetadata
					? {
							name: focusedName,
							value: focusedValue
						}
					: focusedValue
			)
		}
	} as never;
}
