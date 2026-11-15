import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	listUserDivisions: vi.fn(),
	memberHasDivisionKindRole: vi.fn(),
	getDbUserOrThrow: vi.fn(),
	buildUserNickname: vi.fn()
}));

vi.mock('../../../../../src/integrations/prisma/repositories', () => ({
	divisionRepository: { listUserDivisions: mocks.listUserDivisions }
}));

vi.mock('../../../../../src/lib/discord/guild/divisions', () => ({
	memberHasDivisionKindRole: mocks.memberHasDivisionKindRole
}));

vi.mock('../../../../../src/lib/discord/guild/users', () => ({
	getDbUserOrThrow: mocks.getDbUserOrThrow
}));

vi.mock('../../../../../src/lib/services/nickname/buildUserNickname', () => ({
	buildUserNickname: mocks.buildUserNickname
}));

import { syncGuildNickname } from '../../../../../src/lib/services/nickname/guildNicknameRuntime';

describe('syncGuildNickname', () => {
	beforeEach(() => {
		for (const mock of Object.values(mocks)) {
			mock.mockReset();
		}
		mocks.listUserDivisions.mockResolvedValue([]);
		mocks.getDbUserOrThrow.mockResolvedValue({ id: 'db-1', discordNickname: 'Alpha' });
		mocks.memberHasDivisionKindRole.mockResolvedValue(false);
		mocks.buildUserNickname.mockReturnValue({ newUserNickname: 'LGN | Alpha' });
	});

	it('plans a change on a dry run without calling setNickname', async () => {
		const member = createMember('Alpha (edited)');
		const context = createContext();

		const result = await syncGuildNickname({ member: member as never, context, setReason: 'Staff nickname sync', dryRun: true });

		expect(result).toEqual({ outcome: 'updated', member, computedNickname: 'LGN | Alpha' });
		expect(member.setNickname).not.toHaveBeenCalled();
		expect(JSON.stringify((context as { logger: { trace: ReturnType<typeof vi.fn> } }).logger.trace.mock.calls)).not.toContain('LGN | Alpha');
	});

	it('still skips staff on a dry run unless includeStaff is set', async () => {
		mocks.memberHasDivisionKindRole.mockResolvedValue(true);
		const member = createMember('Alpha');

		const skipped = await syncGuildNickname({ member: member as never, context: createContext(), setReason: 'x', dryRun: true });
		const included = await syncGuildNickname({
			member: member as never,
			context: createContext(),
			setReason: 'x',
			dryRun: true,
			includeStaff: true
		});

		expect(skipped).toMatchObject({ outcome: 'skipped', reason: 'User has a staff role' });
		expect(included).toMatchObject({ outcome: 'updated', computedNickname: 'LGN | Alpha' });
		expect(member.setNickname).not.toHaveBeenCalled();
	});

	it('sets the nickname on a live run', async () => {
		const member = createMember('Alpha');

		const result = await syncGuildNickname({ member: member as never, context: createContext(), setReason: 'Staff nickname sync' });

		expect(member.setNickname).toHaveBeenCalledWith('LGN | Alpha', 'Staff nickname sync');
		expect(result).toMatchObject({ outcome: 'updated', computedNickname: 'LGN | Alpha' });
	});
});

function createMember(nickname: string | null) {
	const member = {
		id: '1001',
		nickname,
		guild: { ownerId: 'owner-1' },
		setNickname: vi.fn(async () => member)
	};
	return member;
}

function createContext() {
	const logger = { trace: vi.fn(), child: vi.fn() };
	logger.child.mockReturnValue(logger);
	return { requestId: 'req-1', logger } as never;
}
