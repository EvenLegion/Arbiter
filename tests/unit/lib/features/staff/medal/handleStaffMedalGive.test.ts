import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	prepareGuildInteraction: vi.fn(),
	parseDiscordUserIdInput: vi.fn(),
	createGuildMemberDirectMessageGateway: vi.fn(),
	getVoiceBasedGuildChannel: vi.fn(),
	resolveTrackedAttendeeDiscordUserIds: vi.fn(),
	staffMedalRepository: {
		getRecentEventById: vi.fn(),
		getEventAttendeeByDiscordUserId: vi.fn(),
		listEventMeritRecipients: vi.fn(),
		getStandaloneEligibleUserByDiscordUserId: vi.fn()
	}
}));

vi.mock('../../../../../../src/lib/discord/interactions/prepareGuildInteraction', () => ({
	prepareGuildInteraction: mocks.prepareGuildInteraction
}));

vi.mock('../../../../../../src/lib/discord/members/memberDirectory', () => ({
	parseDiscordUserIdInput: mocks.parseDiscordUserIdInput
}));

vi.mock('../../../../../../src/lib/services/guild-member/guildMemberDirectMessageGateway', () => ({
	createGuildMemberDirectMessageGateway: mocks.createGuildMemberDirectMessageGateway
}));

vi.mock('../../../../../../src/lib/discord/guild/configuredGuild', () => ({
	getVoiceBasedGuildChannel: mocks.getVoiceBasedGuildChannel
}));

vi.mock('../../../../../../src/lib/services/event-tracking/resolveTrackedAttendees', () => ({
	resolveTrackedAttendeeDiscordUserIds: mocks.resolveTrackedAttendeeDiscordUserIds
}));

vi.mock('../../../../../../src/integrations/prisma/repositories', () => ({
	staffMedalRepository: mocks.staffMedalRepository
}));

import { handleStaffMedalGive } from '../../../../../../src/lib/features/staff/medal/handleStaffMedalGive';

describe('handleStaffMedalGive', () => {
	beforeEach(() => {
		mocks.prepareGuildInteraction.mockReset();
		mocks.parseDiscordUserIdInput.mockReset();
		mocks.createGuildMemberDirectMessageGateway.mockReset();
		mocks.getVoiceBasedGuildChannel.mockReset();
		mocks.resolveTrackedAttendeeDiscordUserIds.mockReset();
		mocks.staffMedalRepository.getRecentEventById.mockReset();
		mocks.staffMedalRepository.getEventAttendeeByDiscordUserId.mockReset();
		mocks.staffMedalRepository.listEventMeritRecipients.mockReset();
		mocks.staffMedalRepository.getStandaloneEligibleUserByDiscordUserId.mockReset();
	});

	it('rejects requests with neither event nor user selected', async () => {
		const prepared = createPrepared();
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue(undefined);

		await handleStaffMedalGive({
			interaction: createInteraction({
				medal_name: 'role-1',
				event_name: null,
				user_name: null
			}),
			context: {
				requestId: 'req-1'
			} as never
		});

		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content:
				'You must select either `event_name` or `user_name`. Use `event_name` for bulk medals, or specify a target user. requestId=`req-1`'
		});
	});

	it('bulk grants the medal to recent event merit recipients who do not already have the role', async () => {
		const prepared = createPrepared();
		const memberOne = createGuildMember({ hasRole: false });
		const memberTwo = createGuildMember({ hasRole: true });
		prepared.guild.roles.fetch.mockResolvedValue(
			new Map([
				[
					'role-1',
					{
						id: 'role-1',
						name: 'Medal: Valor'
					}
				]
			])
		);
		prepared.guild.members.fetch.mockImplementation(async (discordUserId: string) => {
			if (discordUserId === 'user-1') {
				return memberOne;
			}
			if (discordUserId === 'user-2') {
				return memberTwo;
			}
			throw new Error('missing');
		});
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.createGuildMemberDirectMessageGateway.mockReturnValue(vi.fn().mockResolvedValue(true));
		mocks.staffMedalRepository.getRecentEventById.mockResolvedValue({
			id: 123,
			name: 'SC Jeopardy',
			createdAt: new Date(),
			state: 'FINALIZED_WITH_MERITS',
			channels: [],
			eventTier: {
				name: 'Tier 1'
			}
		});
		mocks.staffMedalRepository.listEventMeritRecipients.mockResolvedValue([
			{
				user: {
					discordUserId: 'user-1',
					discordNickname: 'Alpha',
					discordUsername: 'alpha'
				}
			},
			{
				user: {
					discordUserId: 'user-2',
					discordNickname: 'Bravo',
					discordUsername: 'bravo'
				}
			}
		]);

		await handleStaffMedalGive({
			interaction: createInteraction({
				medal_name: 'role-1',
				event_name: '123',
				user_name: null
			}),
			context: {
				requestId: 'req-2'
			} as never
		});

		expect(memberOne.roles.add).toHaveBeenCalledWith('role-1', 'Awarded Medal: Valor via /staff medal_give for event SC Jeopardy');
		expect(memberTwo.roles.add).not.toHaveBeenCalled();
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: expect.stringContaining('Granted: 1')
		});
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: expect.stringContaining('Already had role: 1')
		});
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: expect.stringContaining('Failed: 0')
		});
	});

	it('allows a selected attendee to receive the medal even without an event merit', async () => {
		const prepared = createPrepared();
		const member = createGuildMember({ hasRole: false });
		const sendDirectMessage = vi.fn().mockResolvedValue(false);
		prepared.guild.roles.fetch.mockResolvedValue(
			new Map([
				[
					'role-1',
					{
						id: 'role-1',
						name: 'Medal: Valor'
					}
				]
			])
		);
		prepared.guild.members.fetch.mockResolvedValue(member);
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue('user-3');
		mocks.createGuildMemberDirectMessageGateway.mockReturnValue(sendDirectMessage);
		mocks.staffMedalRepository.getRecentEventById.mockResolvedValue({
			id: 456,
			name: 'Armor Drill',
			createdAt: new Date(),
			state: 'ENDED_PENDING_REVIEW',
			channels: [],
			eventTier: {
				name: 'Tier 0'
			}
		});
		mocks.staffMedalRepository.getEventAttendeeByDiscordUserId.mockResolvedValue({
			user: {
				discordUserId: 'user-3',
				discordNickname: 'Charlie',
				discordUsername: 'charlie'
			}
		});

		await handleStaffMedalGive({
			interaction: createInteraction({
				medal_name: 'role-1',
				event_name: '456',
				user_name: 'user-3'
			}),
			context: {
				requestId: 'req-3'
			} as never
		});

		expect(mocks.staffMedalRepository.listEventMeritRecipients).not.toHaveBeenCalled();
		expect(member.roles.add).toHaveBeenCalledWith('role-1', 'Awarded Medal: Valor via /staff medal_give for event Armor Drill');
		expect(sendDirectMessage).toHaveBeenCalled();
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: expect.stringContaining('Could not DM recipient')
		});
	});

	it('rejects bulk medal grants unless the event was finalized with merits', async () => {
		const prepared = createPrepared();
		prepared.guild.roles.fetch.mockResolvedValue(
			new Map([
				[
					'role-1',
					{
						id: 'role-1',
						name: 'Medal: Valor'
					}
				]
			])
		);
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.staffMedalRepository.getRecentEventById.mockResolvedValue({
			id: 789,
			name: 'Live Fire',
			createdAt: new Date(),
			state: 'FINALIZED_NO_MERITS',
			channels: [],
			eventTier: {
				name: 'Tier 1'
			}
		});

		await handleStaffMedalGive({
			interaction: createInteraction({
				medal_name: 'role-1',
				event_name: '789',
				user_name: null
			}),
			context: {
				requestId: 'req-4'
			} as never
		});

		expect(mocks.staffMedalRepository.listEventMeritRecipients).not.toHaveBeenCalled();
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: "You can't award all attendees with a medal because the event was submitted without merits. requestId=`req-4`"
		});
	});

	it('allows an active event medal grant to fall back to standalone eligible users when live attendance cannot prove the user', async () => {
		const prepared = createPrepared();
		const member = createGuildMember({ hasRole: false });
		prepared.guild.roles.fetch.mockResolvedValue(
			new Map([
				[
					'role-1',
					{
						id: 'role-1',
						name: 'Medal: Valor'
					}
				]
			])
		);
		prepared.guild.members.fetch.mockResolvedValue(member);
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue('user-5');
		mocks.createGuildMemberDirectMessageGateway.mockReturnValue(vi.fn().mockResolvedValue(true));
		mocks.resolveTrackedAttendeeDiscordUserIds.mockResolvedValue([]);
		mocks.staffMedalRepository.getRecentEventById.mockResolvedValue({
			id: 900,
			name: 'Current Op',
			createdAt: new Date(),
			state: 'ACTIVE',
			channels: [
				{
					channelId: 'vc-1',
					kind: 'PARENT_VC'
				}
			],
			eventTier: {
				name: 'Tier 2'
			}
		});
		mocks.staffMedalRepository.getEventAttendeeByDiscordUserId.mockResolvedValue(null);
		mocks.staffMedalRepository.getStandaloneEligibleUserByDiscordUserId.mockResolvedValue({
			id: 'db-5',
			discordUserId: 'user-5',
			discordNickname: 'Echo',
			discordUsername: 'echo'
		});

		await handleStaffMedalGive({
			interaction: createInteraction({
				medal_name: 'role-1',
				event_name: '900',
				user_name: 'user-5'
			}),
			context: {
				requestId: 'req-5'
			} as never
		});

		expect(mocks.resolveTrackedAttendeeDiscordUserIds).toHaveBeenCalled();
		expect(member.roles.add).toHaveBeenCalledWith('role-1', 'Awarded Medal: Valor via /staff medal_give for event Current Op');
	});

	it('rejects pasted role ids that do not resolve to Medal: roles', async () => {
		const prepared = createPrepared();
		prepared.guild.roles.fetch.mockResolvedValue(
			new Map([
				[
					'role-1',
					{
						id: 'role-1',
						name: 'Centurion'
					}
				]
			])
		);
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue('user-6');

		await handleStaffMedalGive({
			interaction: createInteraction({
				medal_name: 'role-1',
				event_name: null,
				user_name: 'user-6'
			}),
			context: {
				requestId: 'req-6'
			} as never
		});

		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: 'Invalid `medal_name` value. Select a medal role from autocomplete. requestId=`req-6`'
		});
	});

	it('continues bulk grants when a recipient role add fails and reports the failure count', async () => {
		const prepared = createPrepared();
		const memberOne = createGuildMember({ hasRole: false, addRejects: true });
		const memberTwo = createGuildMember({ hasRole: false });
		prepared.guild.roles.fetch.mockResolvedValue(
			new Map([
				[
					'role-1',
					{
						id: 'role-1',
						name: 'Medal: Valor'
					}
				]
			])
		);
		prepared.guild.members.fetch.mockImplementation(async (discordUserId: string) => {
			if (discordUserId === 'user-7') {
				return memberOne;
			}
			if (discordUserId === 'user-8') {
				return memberTwo;
			}
			throw new Error('missing');
		});
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.createGuildMemberDirectMessageGateway.mockReturnValue(vi.fn().mockResolvedValue(true));
		mocks.staffMedalRepository.getRecentEventById.mockResolvedValue({
			id: 124,
			name: 'CQB Drill',
			createdAt: new Date(),
			state: 'FINALIZED_WITH_MERITS',
			channels: [],
			eventTier: {
				name: 'Tier 1'
			}
		});
		mocks.staffMedalRepository.listEventMeritRecipients.mockResolvedValue([
			{
				user: {
					discordUserId: 'user-7',
					discordNickname: 'Delta',
					discordUsername: 'delta'
				}
			},
			{
				user: {
					discordUserId: 'user-8',
					discordNickname: 'Foxtrot',
					discordUsername: 'foxtrot'
				}
			}
		]);

		await handleStaffMedalGive({
			interaction: createInteraction({
				medal_name: 'role-1',
				event_name: '124',
				user_name: null
			}),
			context: {
				requestId: 'req-7'
			} as never
		});

		expect(memberTwo.roles.add).toHaveBeenCalled();
		expect(prepared.logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({
				targetDiscordUserId: 'user-7',
				roleId: 'role-1'
			}),
			'Failed to grant medal role to target user'
		);
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: expect.stringContaining('Failed: 1')
		});
	});
});

function createPrepared() {
	return {
		guild: {
			roles: {
				fetch: vi.fn()
			},
			members: {
				fetch: vi.fn()
			}
		},
		logger: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn()
		},
		responder: {
			safeEditReply: vi.fn().mockResolvedValue(undefined),
			fail: vi.fn().mockResolvedValue(undefined)
		}
	};
}

function createInteraction(values: Record<string, string | null>) {
	return {
		options: {
			getString: vi.fn((name: string) => values[name] ?? null)
		}
	} as never;
}

function createGuildMember({ hasRole, addRejects = false }: { hasRole: boolean; addRejects?: boolean }) {
	return {
		roles: {
			cache: {
				has: vi.fn(() => hasRole)
			},
			add: addRejects ? vi.fn().mockRejectedValue(new Error('missing permissions')) : vi.fn().mockResolvedValue(undefined)
		}
	};
}
