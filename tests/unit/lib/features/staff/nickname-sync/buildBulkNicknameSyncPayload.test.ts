import { describe, expect, it } from 'vitest';

import { buildBulkNicknameSyncPayload } from '../../../../../../src/lib/features/staff/nickname-sync/buildBulkNicknameSyncPayload';

describe('buildBulkNicknameSyncPayload', () => {
	it('builds a success summary embed', () => {
		const payload = buildBulkNicknameSyncPayload({
			result: {
				kind: 'completed',
				scope: 'single',
				targetCount: 1,
				attempted: 1,
				updated: 1,
				unchanged: 0,
				skippedStaff: 0,
				skippedByRule: 0,
				missingInGuild: 0,
				failed: 0
			},
			includeStaff: true,
			requestId: 'req-1'
		});

		expect(payload.content).toBe('Nickname sync succeeded. requestId=`req-1`');
		expect(payload.embeds).toHaveLength(1);
		expect(payload.embeds[0].data.title).toBe('Nickname Sync Complete');
		expect(payload.embeds[0].data.color).toBe(0x22c55e);
		expect(payload.embeds[0].data.fields?.map((field) => [field.name, field.value])).toContainEqual(['Include Staff', 'Yes']);
	});

	it('renders a warning summary when some users fail', () => {
		const payload = buildBulkNicknameSyncPayload({
			result: {
				kind: 'completed',
				scope: 'all',
				targetCount: 4,
				attempted: 4,
				updated: 2,
				unchanged: 0,
				skippedStaff: 1,
				skippedByRule: 0,
				missingInGuild: 1,
				failed: 1
			},
			includeStaff: false,
			requestId: 'req-2'
		});

		expect(payload.content).toContain('Some nickname sync operations were unsuccessful');
		expect(payload.embeds[0].data.color).toBe(0xf59e0b);
		expect(payload.embeds[0].data.fields?.map((field) => [field.name, field.value])).toContainEqual(['Mode', 'All DB Users']);
	});
});
