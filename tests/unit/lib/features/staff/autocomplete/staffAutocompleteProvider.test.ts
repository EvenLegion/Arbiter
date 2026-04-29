import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getConfiguredGuild: vi.fn(),
	buildGuildMemberAutocompleteChoices: vi.fn(),
	buildDivisionAutocompleteChoices: vi.fn(),
	buildMedalRoleAutocompleteChoices: vi.fn(),
	buildMedalEventAutocompleteChoices: vi.fn(),
	buildEventAttendeeAutocompleteChoices: vi.fn(),
	buildStandaloneMedalEligibleUserChoices: vi.fn()
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

vi.mock('../../../../../../src/lib/features/staff/medal/staffMedalAutocompleteChoices', () => ({
	buildMedalRoleAutocompleteChoices: mocks.buildMedalRoleAutocompleteChoices,
	buildMedalEventAutocompleteChoices: mocks.buildMedalEventAutocompleteChoices,
	buildEventAttendeeAutocompleteChoices: mocks.buildEventAttendeeAutocompleteChoices,
	buildStandaloneMedalEligibleUserChoices: mocks.buildStandaloneMedalEligibleUserChoices
}));

import { handleStaffAutocomplete } from '../../../../../../src/lib/features/staff/autocomplete/staffAutocompleteProvider';

describe('staffAutocompleteProvider', () => {
	beforeEach(() => {
		mocks.getConfiguredGuild.mockReset();
		mocks.buildGuildMemberAutocompleteChoices.mockReset();
		mocks.buildDivisionAutocompleteChoices.mockReset();
		mocks.buildMedalRoleAutocompleteChoices.mockReset();
		mocks.buildMedalEventAutocompleteChoices.mockReset();
		mocks.buildEventAttendeeAutocompleteChoices.mockReset();
		mocks.buildStandaloneMedalEligibleUserChoices.mockReset();
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

	it('routes medal role lookup through the live medal role choices builder', async () => {
		const guild = {
			id: 'guild-1'
		};
		mocks.getConfiguredGuild.mockResolvedValue(guild);
		mocks.buildMedalRoleAutocompleteChoices.mockResolvedValue([
			{
				name: 'Medal: Valor',
				value: 'role-1'
			}
		]);
		const interaction = createInteraction({
			subcommandGroupName: null,
			subcommandName: 'medal_give',
			focusedName: 'medal_name',
			focusedValue: 'val'
		});

		await handleStaffAutocomplete({
			interaction
		});

		expect(mocks.buildMedalRoleAutocompleteChoices).toHaveBeenCalledWith({
			guild,
			query: 'val'
		});
		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: 'Medal: Valor',
				value: 'role-1'
			}
		]);
	});

	it('routes medal event attendee lookup through the attendee query when an event is selected', async () => {
		mocks.buildEventAttendeeAutocompleteChoices.mockResolvedValue([
			{
				name: 'Alpha',
				value: '1'
			}
		]);
		const interaction = createInteraction({
			subcommandGroupName: null,
			subcommandName: 'medal_give',
			focusedName: 'user_name',
			focusedValue: 'alp',
			optionValues: {
				event_name: '123'
			}
		});

		await handleStaffAutocomplete({
			interaction
		});

		expect(mocks.buildEventAttendeeAutocompleteChoices).toHaveBeenCalledWith({
			eventSessionId: 123,
			query: 'alp'
		});
		expect(mocks.buildStandaloneMedalEligibleUserChoices).not.toHaveBeenCalled();
	});

	it('routes medal user lookup through standalone eligible users when no event is selected', async () => {
		mocks.buildStandaloneMedalEligibleUserChoices.mockResolvedValue([
			{
				name: 'Bravo',
				value: '2'
			}
		]);
		const interaction = createInteraction({
			subcommandGroupName: null,
			subcommandName: 'medal_give',
			focusedName: 'user_name',
			focusedValue: 'bra'
		});

		await handleStaffAutocomplete({
			interaction
		});

		expect(mocks.buildStandaloneMedalEligibleUserChoices).toHaveBeenCalledWith({
			query: 'bra'
		});
		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: 'Bravo',
				value: '2'
			}
		]);
	});
});

function createInteraction({
	subcommandGroupName,
	subcommandName,
	focusedName,
	focusedValue,
	optionValues = {}
}: {
	subcommandGroupName: string | null;
	subcommandName: string | null;
	focusedName: string;
	focusedValue: string;
	optionValues?: Record<string, string>;
}) {
	return {
		respond: vi.fn().mockResolvedValue(undefined),
		options: {
			getSubcommandGroup: vi.fn(() => subcommandGroupName),
			getSubcommand: vi.fn(() => subcommandName),
			getString: vi.fn((name: string) => optionValues[name] ?? null),
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
