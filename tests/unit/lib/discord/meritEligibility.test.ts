import type { Guild } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ listCachedDivisions: vi.fn() }));
vi.mock('../../../../src/lib/discord/guild/divisions', () => mocks);
import { createMeritEligibilityResolver } from '../../../../src/lib/discord/guild/meritEligibility';

const divisions = ['LGN', 'INT', 'RES'].map((code) => ({ code, discordRoleId: `configured-${code}` }));

describe('merit eligibility Discord gateway', () => {
	beforeEach(() => {
		mocks.listCachedDivisions.mockReset().mockResolvedValue(divisions);
	});

	it.each(['LGN', 'INT', 'RES'])('accepts the configured %s role and forces a fresh member read', async (code) => {
		const fetch = vi.fn().mockResolvedValue(member([`configured-${code}`]));
		expect(await createMeritEligibilityResolver({ members: { fetch } } as unknown as Guild)('recipient')).toBe('eligible');
		expect(fetch).toHaveBeenCalledWith({ user: 'recipient', force: true });
		expect(mocks.listCachedDivisions).toHaveBeenCalledWith({ codes: ['LGN', 'INT', 'RES'] });
	});

	it('rejects staff and unrelated roles without org membership', async () => {
		const fetch = vi.fn().mockResolvedValue(member(['staff', 'LGN', 'unrelated']));
		expect(await createMeritEligibilityResolver({ members: { fetch } } as unknown as Guild)('recipient')).toBe('not_org_member');
	});

	it('sees role removal even if the guild member cache still has the role', async () => {
		const fetch = vi.fn().mockResolvedValue(member([]));
		const guild = { members: { fetch, cache: new Map([['recipient', member(['configured-LGN'])]]) } } as unknown as Guild;
		expect(await createMeritEligibilityResolver(guild)('recipient')).toBe('not_org_member');
	});

	it.each([new Error('network unavailable'), { code: 50013 }, { code: 429 }])('does not turn failed lookup into nonmembership', async (error) => {
		const fetch = vi.fn().mockRejectedValue(error);
		expect(await createMeritEligibilityResolver({ members: { fetch } } as unknown as Guild)('recipient')).toBe('unavailable');
	});

	it('recognizes Discord Unknown Member as nonmembership', async () => {
		const fetch = vi.fn().mockRejectedValue({ code: 10007 });
		expect(await createMeritEligibilityResolver({ members: { fetch } } as unknown as Guild)('recipient')).toBe('not_org_member');
	});

	it.each([[], divisions.map((d) => ({ ...d, discordRoleId: null }))])('fails closed for incomplete configuration %#', async (configured) => {
		mocks.listCachedDivisions.mockResolvedValue(configured);
		const fetch = vi.fn();
		expect(await createMeritEligibilityResolver({ members: { fetch } } as unknown as Guild)('recipient')).toBe('unavailable');
		expect(fetch).not.toHaveBeenCalled();
	});

	it('accepts a confirmed eligible role even if another qualifying role is unconfigured', async () => {
		mocks.listCachedDivisions.mockResolvedValue([{ code: 'LGN', discordRoleId: 'configured-LGN' }]);
		const fetch = vi.fn().mockResolvedValue(member(['configured-LGN']));
		expect(await createMeritEligibilityResolver({ members: { fetch } } as unknown as Guild)('recipient')).toBe('eligible');
	});

	it('keeps unmatched partial configuration unavailable instead of declaring nonmembership', async () => {
		mocks.listCachedDivisions.mockResolvedValue([{ code: 'LGN', discordRoleId: 'configured-LGN' }]);
		const fetch = vi.fn().mockResolvedValue(member([]));
		expect(await createMeritEligibilityResolver({ members: { fetch } } as unknown as Guild)('recipient')).toBe('unavailable');
	});

	it('fails closed when configuration cannot load', async () => {
		mocks.listCachedDivisions.mockRejectedValue(new Error('cache failure'));
		expect(await createMeritEligibilityResolver({} as Guild)('recipient')).toBe('unavailable');
	});
});

function member(roleIds: string[]) {
	return { user: { bot: false }, roles: { cache: new Map(roleIds.map((id) => [id, {}])) } };
}
