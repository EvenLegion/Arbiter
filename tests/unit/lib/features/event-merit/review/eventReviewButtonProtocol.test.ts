import { EventReviewDecisionKind } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { parseEventReviewButtonCustomId } from '../../../../../../src/lib/features/event-merit/review/buttons/eventReviewButtonProtocol';

describe('eventReviewButtonProtocol', () => {
	it('parses page actions', () => {
		expect(parseEventReviewButtonCustomId('event:review:page:42:3')).toEqual({
			action: 'page',
			eventSessionId: 42,
			page: 3
		});
	});

	it('parses submit actions for merit and no-merit modes', () => {
		expect(parseEventReviewButtonCustomId('event:review:submit:with:42')).toEqual({
			action: 'submit',
			eventSessionId: 42,
			mode: 'with'
		});

		expect(parseEventReviewButtonCustomId('event:review:submit:without:42')).toEqual({
			action: 'submit',
			eventSessionId: 42,
			mode: 'without'
		});
	});

	it('parses decision actions', () => {
		expect(parseEventReviewButtonCustomId('event:review:decision:42:user-123:m:2')).toEqual({
			action: 'decision',
			eventSessionId: 42,
			targetDbUserId: 'user-123',
			decision: EventReviewDecisionKind.MERIT,
			page: 2
		});

		expect(parseEventReviewButtonCustomId('event:review:decision:42:user-123:n:2')).toEqual({
			action: 'decision',
			eventSessionId: 42,
			targetDbUserId: 'user-123',
			decision: EventReviewDecisionKind.NO_MERIT,
			page: 2
		});
	});

	it('rejects invalid scope or domain', () => {
		expect(parseEventReviewButtonCustomId('ticket:review:page:42:3')).toBeNull();
	});

	it('rejects invalid event session ids and pages', () => {
		expect(parseEventReviewButtonCustomId('event:review:page:nope:3')).toBeNull();

		expect(parseEventReviewButtonCustomId('event:review:page:42:nope')).toBeNull();
	});

	it('rejects invalid decision codes', () => {
		expect(parseEventReviewButtonCustomId('event:review:decision:42:user-123:x:2')).toBeNull();
	});
});
