import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getConfiguredGuild: vi.fn(),
	getGuildMemberOrThrow: vi.fn(),
	memberHasDivisionKindRole: vi.fn(),
	buildMeritExistingEventChoices: vi.fn(),
	buildManualMeritTypeChoices: vi.fn(),
	buildMeritMemberChoices: vi.fn()
}));

vi.mock('../../../../../src/lib/discord/guild/configuredGuild', () => ({
	getConfiguredGuild: mocks.getConfiguredGuild
}));

vi.mock('../../../../../src/lib/discord/guild/guildMembers', () => ({
	getGuildMemberOrThrow: mocks.getGuildMemberOrThrow
}));

vi.mock('../../../../../src/lib/discord/guild/divisions', () => ({
	memberHasDivisionKindRole: mocks.memberHasDivisionKindRole
}));

vi.mock('../../../../../src/lib/features/merit/autocomplete/meritAutocompleteChoices', () => ({
	buildMeritExistingEventChoices: mocks.buildMeritExistingEventChoices,
	buildManualMeritTypeChoices: mocks.buildManualMeritTypeChoices,
	buildMeritMemberChoices: mocks.buildMeritMemberChoices
}));

import { handleMeritAutocomplete } from '../../../../../src/lib/features/merit/autocomplete/meritAutocompleteProvider';

describe('meritAutocompleteProvider', () => {
	beforeEach(() => {
		mocks.getConfiguredGuild.mockReset();
		mocks.getGuildMemberOrThrow.mockReset();
		mocks.memberHasDivisionKindRole.mockReset();
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

		expect(interaction.respond).toHaveBeenCalledWith([]);
		expect(mocks.getConfiguredGuild).not.toHaveBeenCalled();
	});

	it('routes staff event lookup through the existing-event option builder', async () => {
		const guild = {
			id: 'guild-1'
		};
		mocks.getConfiguredGuild.mockResolvedValue(guild);
		mocks.getGuildMemberOrThrow.mockResolvedValue({
			id: '42',
			displayName: 'Requester'
		});
		mocks.memberHasDivisionKindRole.mockResolvedValue(true);
		mocks.buildMeritExistingEventChoices.mockResolvedValue([
			{
				name: 'Today | Event',
				value: '11'
			}
		]);
		const interaction = createInteraction({
			subcommandName: 'give',
			focusedName: 'existing_event',
			focusedValue: '  event  ',
			userId: '42'
		});

		await handleMeritAutocomplete({
			interaction
		});

		expect(mocks.getGuildMemberOrThrow).toHaveBeenCalledWith({
			guild,
			discordUserId: '42'
		});
		expect(mocks.buildMeritExistingEventChoices).toHaveBeenCalledWith({
			query: 'event'
		});
		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: 'Today | Event',
				value: '11'
			}
		]);
	});

	it('routes staff merit-type lookup through the merit-type choice builder', async () => {
		const guild = {
			id: 'guild-1'
		};
		mocks.getConfiguredGuild.mockResolvedValue(guild);
		mocks.getGuildMemberOrThrow.mockResolvedValue({
			id: '42',
			displayName: 'Requester'
		});
		mocks.memberHasDivisionKindRole.mockResolvedValue(true);
		mocks.buildManualMeritTypeChoices.mockResolvedValue([
			{
				name: 'Assist (+2 merits)',
				value: 'assist'
			}
		]);
		const interaction = createInteraction({
			subcommandName: 'give',
			focusedName: 'merit_type',
			focusedValue: '  assist ',
			userId: '42'
		});

		await handleMeritAutocomplete({
			interaction
		});

		expect(mocks.buildManualMeritTypeChoices).toHaveBeenCalledWith({
			query: 'assist'
		});
		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: 'Assist (+2 merits)',
				value: 'assist'
			}
		]);
	});

	it('limits non-staff list lookups to the requester identity', async () => {
		const guild = {
			id: 'guild-1'
		};
		mocks.getConfiguredGuild.mockResolvedValue(guild);
		mocks.getGuildMemberOrThrow.mockResolvedValue({
			id: '42',
			displayName: 'Requester Name'
		});
		mocks.memberHasDivisionKindRole.mockResolvedValue(false);
		const interaction = createInteraction({
			subcommandName: 'list',
			focusedName: 'player_name',
			focusedValue: '',
			userId: '42'
		});

		await handleMeritAutocomplete({
			interaction
		});

		expect(interaction.respond).toHaveBeenCalledWith([
			{
				name: 'Requester Name',
				value: '42'
			}
		]);
		expect(mocks.buildMeritMemberChoices).not.toHaveBeenCalled();
	});

	it('blocks non-staff give autocomplete before member search', async () => {
		const guild = {
			id: 'guild-1'
		};
		mocks.getConfiguredGuild.mockResolvedValue(guild);
		mocks.getGuildMemberOrThrow.mockResolvedValue({
			id: '42',
			displayName: 'Requester Name'
		});
		mocks.memberHasDivisionKindRole.mockResolvedValue(false);
		const interaction = createInteraction({
			subcommandName: 'give',
			focusedName: 'user_name',
			focusedValue: 'abc',
			userId: '42'
		});

		await handleMeritAutocomplete({
			interaction
		});

		expect(interaction.respond).toHaveBeenCalledWith([]);
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
		respond: vi.fn().mockResolvedValue(undefined),
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
