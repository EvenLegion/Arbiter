import { Collection, type Guild } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { createIaeEventRecoveryDeps } from '../../../../src/lib/features/debug/createIaeEventRecoveryDeps';
import { IAE_THREAD_ID, type IaeRecoverySnapshot } from '../../../../src/lib/services/event-recovery/iaeEventRecovery';

vi.mock('../../../../src/integrations/prisma/event/review/iaeEventRecoveryRepository', () => ({
	readIaeEventRecoveryState: vi.fn(),
	persistIaeSnapshot: vi.fn(),
	persistIaeReview: vi.fn()
}));
vi.mock('../../../../src/integrations/prisma/event/review/getEventReviewPage', () => ({ getEventReviewPage: vi.fn() }));
vi.mock('../../../../src/integrations/redis/client', () => ({ getRedisClient: vi.fn() }));

const snapshot = { guildId: 'test-guild-id' } as IaeRecoverySnapshot;
function setup() {
	const fetchMessages = vi.fn().mockResolvedValue(new Collection());
	const has = vi.fn().mockReturnValue(true);
	const channel = {
		id: IAE_THREAD_ID,
		guildId: snapshot.guildId,
		parentId: 'parent',
		isThread: () => true,
		archived: false,
		locked: false,
		permissionsFor: () => ({ has }),
		messages: { fetch: fetchMessages }
	};
	const fetchChannel = vi.fn().mockImplementation(async (id) => (id === IAE_THREAD_ID ? channel : {}));
	const guild = {
		id: snapshot.guildId,
		channels: { fetch: fetchChannel },
		members: { fetchMe: vi.fn().mockResolvedValue({}) },
		client: { user: { id: 'bot' } }
	} as unknown as Guild;
	return { deps: createIaeEventRecoveryDeps({ guild }), fetchMessages, has, channel, fetchChannel };
}
function message(id: string, title = 'Event Merit Review', count = '75') {
	return {
		id,
		channelId: IAE_THREAD_ID,
		author: { id: 'bot' },
		embeds: [{ title, footer: { text: 'Event session ID: 1011' }, fields: [{ name: 'Number of Attendees', value: count }] }]
	};
}
describe('incident recovery runtime preflight', () => {
	it('fetches parent and rejects missing history permissions before inspecting messages', async () => {
		const s = setup();
		s.has.mockReturnValue(false);
		await expect(s.deps.findReviewMessages(snapshot)).rejects.toThrow('thread_permissions_missing');
		expect(s.fetchChannel).toHaveBeenCalledWith('parent', { force: true });
		expect(s.fetchMessages).not.toHaveBeenCalled();
	});
	it('preserves tracking summary and recognizes only the exact review', async () => {
		const s = setup();
		s.fetchMessages.mockResolvedValue(
			new Collection([
				['1', message('1', 'Event Tracking Summary')],
				['2', message('2')]
			])
		);
		expect(await s.deps.findReviewMessages(snapshot)).toEqual([{ id: '2', channelId: IAE_THREAD_ID, attendeeCount: 75 }]);
	});
	it('fails closed on duplicates or changed attendee totals', async () => {
		const s = setup();
		s.fetchMessages.mockResolvedValue(
			new Collection([
				['1', message('1')],
				['2', message('2')]
			])
		);
		await expect(s.deps.findReviewMessages(snapshot)).rejects.toThrow('multiple_review_messages');
		s.fetchMessages.mockResolvedValue(new Collection([['1', message('1', 'Event Merit Review', '74')]]));
		await expect(s.deps.findReviewMessages(snapshot)).rejects.toThrow();
	});
	it('never considers 20 full pages proof of absence', async () => {
		const s = setup();
		let page = 0;
		s.fetchMessages.mockImplementation(
			async () =>
				new Collection(
					Array.from({ length: 100 }, (_, i) => {
						const id = String(++page * 100 + i);
						return [id, message(id, 'Other')];
					})
				)
		);
		await expect(s.deps.findReviewMessages(snapshot)).rejects.toThrow('history_scan_incomplete');
		expect(s.fetchMessages).toHaveBeenCalledTimes(20);
	});
	it('refuses archived threads and wrong guilds', async () => {
		const s = setup();
		s.channel.archived = true;
		await expect(s.deps.verifyRuntime(snapshot)).rejects.toThrow('thread_unavailable');
		await expect(s.deps.verifyRuntime({ ...snapshot, guildId: 'other' })).rejects.toThrow('guild_mismatch');
	});
});
