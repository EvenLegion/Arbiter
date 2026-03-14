import { describe, expect, it } from 'vitest';

import { parseEventStartButton } from '../../../../../../src/lib/features/event-merit/session/parseEventStartButton';

describe('parseEventStartButton', () => {
	it('parses confirm, cancel, and end actions', () => {
		expect(
			parseEventStartButton({
				customId: 'event:start:confirm:42'
			})
		).toEqual({
			action: 'confirm',
			eventSessionId: 42
		});

		expect(
			parseEventStartButton({
				customId: 'event:start:cancel:42'
			})
		).toEqual({
			action: 'cancel',
			eventSessionId: 42
		});

		expect(
			parseEventStartButton({
				customId: 'event:start:end:42'
			})
		).toEqual({
			action: 'end',
			eventSessionId: 42
		});
	});

	it('rejects invalid actions', () => {
		expect(
			parseEventStartButton({
				customId: 'event:start:resume:42'
			})
		).toBeNull();
	});

	it('rejects invalid session ids', () => {
		expect(
			parseEventStartButton({
				customId: 'event:start:confirm:not-a-number'
			})
		).toBeNull();
	});

	it('rejects invalid scope or domain', () => {
		expect(
			parseEventStartButton({
				customId: 'ticket:start:confirm:42'
			})
		).toBeNull();
	});
});
