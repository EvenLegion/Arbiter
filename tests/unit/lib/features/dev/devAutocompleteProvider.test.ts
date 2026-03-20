import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getConfiguredGuild: vi.fn(),
	buildGuildMemberAutocompleteChoices: vi.fn()
}));

vi.mock('../../../../../src/lib/discord/guild/configuredGuild', () => ({
	getConfiguredGuild: mocks.getConfiguredGuild
}));

vi.mock('../../../../../src/lib/discord/members/memberDirectory', () => ({
	buildGuildMemberAutocompleteChoices: mocks.buildGuildMemberAutocompleteChoices
}));

import { handleDevAutocomplete } from '../../../../../src/lib/features/dev/devAutocompleteProvider';

describe('devAutocompleteProvider', () => {
	beforeEach(() => {
		mocks.getConfiguredGuild.mockReset();
		mocks.buildGuildMemberAutocompleteChoices.mockReset();
	});

	it('routes nickname user lookup through the guild member directory', async () => {
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
			subcommandGroupName: 'nickname',
			subcommandName: 'remove-prefix',
			focusedName: 'user',
			focusedValue: 'Mem'
		});

		await handleDevAutocomplete({
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

	it('returns an empty response for unrelated dev options', async () => {
		const interaction = createInteraction({
			subcommandGroupName: 'nickname',
			subcommandName: 'reset',
			focusedName: 'reason',
			focusedValue: 'ignored'
		});

		await handleDevAutocomplete({
			interaction
		});

		expect(interaction.respond).toHaveBeenCalledWith([]);
		expect(mocks.getConfiguredGuild).not.toHaveBeenCalled();
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
		id: 'interaction-1',
		user: {
			id: 'user-1'
		},
		guildId: 'guild-1',
		channelId: 'channel-1',
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
