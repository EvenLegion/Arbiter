import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	resolveAutocompleteGuild: vi.fn(),
	respondWithAutocompleteChoices: vi.fn(),
	respondWithEmptyAutocompleteChoices: vi.fn(),
	buildGuildMemberAutocompleteChoices: vi.fn(),
	buildDivisionAutocompleteChoices: vi.fn()
}));

vi.mock('../../../../../src/lib/discord/autocompleteResponder', () => ({
	resolveAutocompleteGuild: mocks.resolveAutocompleteGuild,
	respondWithAutocompleteChoices: mocks.respondWithAutocompleteChoices,
	respondWithEmptyAutocompleteChoices: mocks.respondWithEmptyAutocompleteChoices
}));

vi.mock('../../../../../src/lib/discord/memberDirectory', () => ({
	buildGuildMemberAutocompleteChoices: mocks.buildGuildMemberAutocompleteChoices
}));

vi.mock('../../../../../src/lib/features/division-selection/divisionDirectory', () => ({
	buildDivisionAutocompleteChoices: mocks.buildDivisionAutocompleteChoices
}));

import { handleStaffAutocomplete } from '../../../../../src/lib/features/staff/staffAutocompleteProvider';

describe('staffAutocompleteProvider', () => {
	beforeEach(() => {
		mocks.resolveAutocompleteGuild.mockReset();
		mocks.respondWithAutocompleteChoices.mockReset();
		mocks.respondWithEmptyAutocompleteChoices.mockReset();
		mocks.buildGuildMemberAutocompleteChoices.mockReset();
		mocks.buildDivisionAutocompleteChoices.mockReset();
	});

	it('routes sync nickname user lookup through the guild member directory', async () => {
		const guild = {
			id: 'guild-1'
		};
		mocks.resolveAutocompleteGuild.mockResolvedValue(guild);
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

		expect(mocks.resolveAutocompleteGuild).toHaveBeenCalledWith(
			expect.objectContaining({
				interaction
			})
		);
		expect(mocks.buildGuildMemberAutocompleteChoices).toHaveBeenCalledWith({
			guild,
			query: 'mem'
		});
		expect(mocks.respondWithAutocompleteChoices).toHaveBeenCalledWith(
			expect.objectContaining({
				interaction,
				choices: [
					{
						name: 'Member One',
						value: 'member-1'
					}
				]
			})
		);
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
		expect(mocks.respondWithAutocompleteChoices).toHaveBeenCalledWith(
			expect.objectContaining({
				interaction,
				choices: [
					{
						name: 'Navy',
						value: 'NVY'
					}
				]
			})
		);
		expect(mocks.resolveAutocompleteGuild).not.toHaveBeenCalled();
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

		expect(mocks.respondWithEmptyAutocompleteChoices).toHaveBeenCalledWith(interaction);
		expect(mocks.respondWithAutocompleteChoices).not.toHaveBeenCalled();
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
