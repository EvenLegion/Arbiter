import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getConfiguredGuild: vi.fn(),
	getGuildMemberOrThrow: vi.fn(),
	memberHasDivisionKindRole: vi.fn(),
	memberHasDivision: vi.fn()
}));

vi.mock('../../../../src/lib/discord/guild/configuredGuild', () => ({
	getConfiguredGuild: mocks.getConfiguredGuild
}));

vi.mock('../../../../src/lib/discord/guild/guildMembers', () => ({
	getGuildMemberOrThrow: mocks.getGuildMemberOrThrow
}));

vi.mock('../../../../src/lib/discord/guild/divisions', () => ({
	memberHasDivisionKindRole: mocks.memberHasDivisionKindRole,
	memberHasDivision: mocks.memberHasDivision
}));

import { resolvePreconditionActor } from '../../../../src/lib/discord/actor/preconditionActor';

describe('preconditionActor', () => {
	beforeEach(() => {
		mocks.getConfiguredGuild.mockReset();
		mocks.getGuildMemberOrThrow.mockReset();
		mocks.memberHasDivisionKindRole.mockReset();
		mocks.memberHasDivision.mockReset();
	});

	it('returns an error when the configured guild cannot be resolved', async () => {
		mocks.getConfiguredGuild.mockRejectedValue(new Error('missing guild'));

		const result = await resolvePreconditionActor({
			interaction: createInteraction(),
			preconditionName: 'StaffOnly',
			capabilityRequirement: 'staff'
		});

		expect(result).toEqual({
			ok: false,
			message: 'This command can only be used in a server.'
		});
	});

	it('returns an error when the member cannot be resolved', async () => {
		mocks.getConfiguredGuild.mockResolvedValue({
			id: 'guild-1'
		});
		mocks.getGuildMemberOrThrow.mockRejectedValue(new Error('missing member'));

		const result = await resolvePreconditionActor({
			interaction: createInteraction(),
			preconditionName: 'StaffOnly',
			capabilityRequirement: 'staff'
		});

		expect(result).toEqual({
			ok: false,
			message: 'Could not resolve your member record in this server.'
		});
	});

	it('returns capability flags for an event operator', async () => {
		const member = {
			id: 'member-1'
		};
		mocks.getConfiguredGuild.mockResolvedValue({
			id: 'guild-1'
		});
		mocks.getGuildMemberOrThrow.mockResolvedValue(member);
		mocks.memberHasDivisionKindRole.mockResolvedValue(false);
		mocks.memberHasDivision.mockResolvedValue(true);

		const result = await resolvePreconditionActor({
			interaction: createInteraction(),
			preconditionName: 'EventOperatorOnly',
			capabilityRequirement: 'staff-or-centurion'
		});

		expect(result).toEqual({
			ok: true,
			member,
			isStaff: false,
			isCenturion: true
		});
	});
});

function createInteraction() {
	return {
		user: {
			id: 'user-1'
		}
	} as never;
}
