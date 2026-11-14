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

describe('bulk medal resilience', () => {
	function fixture(count = 75) {
		const prepared = createPrepared();
		const targets = Array.from({ length: count }, (_, index) => ({
			user: {
				discordUserId: `bulk-${index}`,
				discordNickname: null,
				discordUsername: null
			}
		}));
		const members = targets.map(() => {
			let hasRole = false;
			return {
				roles: {
					cache: { has: vi.fn(() => hasRole) },
					add: vi.fn(async () => {
						hasRole = true;
					})
				}
			};
		});
		prepared.guild.roles.fetch.mockResolvedValue(new Map([['role-1', { id: 'role-1', name: 'Medal: Valor' }]]));
		prepared.guild.members.fetch.mockImplementation(async (id: string) => members[Number(id.split('-')[1])]);
		mocks.prepareGuildInteraction.mockResolvedValue(prepared);
		mocks.parseDiscordUserIdInput.mockReturnValue(undefined);
		mocks.staffMedalRepository.getRecentEventById.mockResolvedValue({ id: 1011, name: 'Large event', state: 'FINALIZED_WITH_MERITS' });
		mocks.staffMedalRepository.listEventMeritRecipients.mockResolvedValue(targets);
		const dm = vi.fn().mockResolvedValue(true);
		mocks.createGuildMemberDirectMessageGateway.mockReturnValue(dm);
		let clock = 0;
		const runtime = {
			now: () => clock,
			sleep: vi.fn(async (ms: number) => {
				clock += ms;
			})
		};
		const run = () =>
			handleStaffMedalGive({
				interaction: createInteraction({ medal_name: 'role-1', event_name: '1011', user_name: null }),
				context: { requestId: 'bulk-test' } as never,
				bulkRuntime: runtime
			});
		return { prepared, targets, members, dm, runtime, run };
	}

	it('processes all 75 unique recipients, paces mutations, and skips existing medals on retry', async () => {
		const f = fixture();
		mocks.staffMedalRepository.listEventMeritRecipients.mockResolvedValue([...f.targets, f.targets[0]]);
		await f.run();
		expect(f.members.every((member) => member.roles.add.mock.calls.length === 1)).toBe(true);
		expect(f.dm).toHaveBeenCalledTimes(75);
		expect(f.runtime.sleep).toHaveBeenCalledTimes(74);
		expect(f.prepared.responder.safeEditReply).toHaveBeenLastCalledWith({ content: expect.stringContaining('Processed: 75; remaining: 0') });
		await f.run();
		expect(f.dm).toHaveBeenCalledTimes(75);
		expect(f.prepared.responder.safeEditReply).toHaveBeenLastCalledWith({ content: expect.stringContaining('Already had role: 75') });
	});

	it('stops between recipients at the deadline and reports a resumable partial result', async () => {
		const f = fixture();
		let now = 0;
		f.runtime.now = () => now;
		f.runtime.sleep.mockImplementation(async () => {
			now += 13 * 60_000;
		});
		await f.run();
		expect(f.dm).toHaveBeenCalledTimes(1);
		expect(f.prepared.responder.safeEditReply).toHaveBeenLastCalledWith({ content: expect.stringContaining('Processed: 1; remaining: 74') });
		expect(f.prepared.logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({ remaining: 74 }),
			'staff.medal_give.bulk.completed_with_failures'
		);
	});

	it('blocks overlapping medal grants and releases the guard after completion', async () => {
		const f = fixture(1);
		let finish!: () => void;
		let started!: () => void;
		const entered = new Promise<void>((resolve) => {
			started = resolve;
		});
		f.dm.mockImplementationOnce(async () => {
			started();
			await new Promise<void>((resolve) => {
				finish = resolve;
			});
			return true;
		});
		const first = f.run();
		await entered;
		await f.run();
		expect(f.prepared.responder.safeEditReply).toHaveBeenLastCalledWith({ content: expect.stringContaining('already running') });
		finish();
		await first;
		await f.run();
		expect(f.members[0].roles.add).toHaveBeenCalledTimes(1);
		expect(f.dm).toHaveBeenCalledTimes(1);
		expect(f.prepared.responder.safeEditReply).toHaveBeenLastCalledWith({ content: expect.stringContaining('Already had role: 1') });
	});

	it('counts fetch failures separately from departed members and continues after a DM failure', async () => {
		const f = fixture(3);
		f.prepared.guild.members.fetch.mockRejectedValueOnce(new Error('temporary network failure')).mockRejectedValueOnce({ code: 10007 });
		f.dm.mockRejectedValueOnce(new Error('DM lookup failed'));
		await f.run();
		const reply = f.prepared.responder.safeEditReply.mock.calls.at(-1)?.[0].content;
		expect(reply).toContain('Failed: 1');
		expect(reply).toContain('Not in guild: 1');
		expect(reply).toContain('Granted: 1');
		expect(reply).toContain('Recipient DMs sent: 0/1');
		expect(reply).toContain('remaining: 0');
	});

	it('releases the guard after a repository error', async () => {
		const f = fixture(1);
		mocks.staffMedalRepository.listEventMeritRecipients.mockRejectedValueOnce(new Error('database unavailable'));
		await f.run();
		expect(f.prepared.responder.fail).toHaveBeenCalled();
		await f.run();
		expect(f.dm).toHaveBeenCalledTimes(1);
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
