import { describe, expect, it } from 'vitest';

import {
	buildEventPingButtonCustomId,
	parseEventPingButtonCustomId
} from '../../../../../../src/lib/features/event-merit/session/event-ping/eventPingButtonCustomId';

describe('eventPingButtonCustomId', () => {
	it('builds and parses the versioned send action', () => {
		expect(buildEventPingButtonCustomId(42)).toBe('event:ping:v1:send:42');
		expect(parseEventPingButtonCustomId('event:ping:v1:send:42')).toEqual({
			action: 'send',
			eventSessionId: 42
		});
	});

	it.each(['event:ping:v2:send:42', 'event:ping:v1:retry:42', 'event:ping:v1:send:0', 'event:ping:v1:send:not-a-number'])(
		'rejects invalid or unsupported protocol value %s',
		(customId) => {
			expect(parseEventPingButtonCustomId(customId)).toBeNull();
		}
	);
});
