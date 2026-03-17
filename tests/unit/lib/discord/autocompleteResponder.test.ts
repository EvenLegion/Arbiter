import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getConfiguredGuild: vi.fn(),
	getGuildMemberOrThrow: vi.fn(),
	memberHasDivisionKindRole: vi.fn()
}));

vi.mock('../../../../src/lib/discord/configuredGuildGateway', () => ({
	getConfiguredGuild: mocks.getConfiguredGuild
}));

vi.mock('../../../../src/lib/discord/guildMemberGateway', () => ({
	getGuildMemberOrThrow: mocks.getGuildMemberOrThrow
}));

vi.mock('../../../../src/lib/discord/divisionPolicyGateway', () => ({
	memberHasDivisionKindRole: mocks.memberHasDivisionKindRole
}));

import {
	resolveAutocompleteGuild,
	resolveAutocompleteRequester,
	respondWithAutocompleteChoices,
	respondWithEmptyAutocompleteChoices
} from '../../../../src/lib/discord/autocompleteResponder';

describe('autocompleteResponder', () => {
	const error = vi.fn();

	beforeEach(() => {
		mocks.getConfiguredGuild.mockReset();
		mocks.getGuildMemberOrThrow.mockReset();
		mocks.memberHasDivisionKindRole.mockReset();
		error.mockReset();
	});

	it('responds with an empty list when guild lookup fails', async () => {
		mocks.getConfiguredGuild.mockRejectedValue(new Error('missing guild'));
		const interaction = createInteraction();

		const guild = await resolveAutocompleteGuild({
			interaction,
			logger: {
				error
			} as never,
			loggerContext: {
				commandName: 'test'
			},
			logMessage: 'guild failed'
		});

		expect(guild).toBeNull();
		expect(interaction.respond).toHaveBeenCalledWith([]);
		expect(error).toHaveBeenCalled();
	});

	it('falls back to an empty response when sending choices fails', async () => {
		const interaction = createInteraction({
			respond: vi.fn().mockRejectedValueOnce(new Error('respond failed')).mockResolvedValueOnce(undefined)
		});

		await respondWithAutocompleteChoices({
			interaction,
			choices: [
				{
					name: 'One',
					value: '1'
				}
			],
			logger: {
				error
			} as never,
			loggerContext: {
				commandName: 'test'
			},
			logMessage: 'respond failed'
		});

		expect(interaction.respond).toHaveBeenNthCalledWith(1, [
			{
				name: 'One',
				value: '1'
			}
		]);
		expect(interaction.respond).toHaveBeenNthCalledWith(2, []);
		expect(error).toHaveBeenCalled();
	});

	it('resolves autocomplete requester capability flags', async () => {
		const member = {
			id: 'member-1'
		};
		mocks.getGuildMemberOrThrow.mockResolvedValue(member);
		mocks.memberHasDivisionKindRole.mockResolvedValue(true);

		const result = await resolveAutocompleteRequester({
			guild: {} as never,
			discordUserId: 'member-1'
		});

		expect(result).toEqual({
			member,
			isStaff: true
		});
	});

	it('swallows empty-choice response errors', async () => {
		const interaction = createInteraction({
			respond: vi.fn().mockRejectedValue(new Error('nope'))
		});

		await expect(respondWithEmptyAutocompleteChoices(interaction)).resolves.toBeUndefined();
	});
});

function createInteraction(overrides: Partial<{ respond: ReturnType<typeof vi.fn> }> = {}) {
	return {
		respond: vi.fn().mockResolvedValue(undefined),
		...overrides
	};
}
