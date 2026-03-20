import { describe, expect, it } from 'vitest';

import { parseEventStartButtonCustomId } from '../../../../../../src/lib/features/event-merit/session/buttons/eventStartButtonCustomId';

describe('eventStartButtonCustomId', () => {
	it('parses confirm, cancel, and end actions', () => {
		expect(parseEventStartButtonCustomId('event:start:confirm:42')).toEqual({
			action: 'confirm',
			eventSessionId: 42
		});

		expect(parseEventStartButtonCustomId('event:start:cancel:42')).toEqual({
			action: 'cancel',
			eventSessionId: 42
		});

		expect(parseEventStartButtonCustomId('event:start:end:42')).toEqual({
			action: 'end',
			eventSessionId: 42
		});
	});

	it('rejects invalid actions', () => {
		expect(parseEventStartButtonCustomId('event:start:resume:42')).toBeNull();
	});

	it('rejects invalid session ids', () => {
		expect(parseEventStartButtonCustomId('event:start:confirm:not-a-number')).toBeNull();
	});

	it('rejects invalid scope or domain', () => {
		expect(parseEventStartButtonCustomId('ticket:start:confirm:42')).toBeNull();
	});
});
