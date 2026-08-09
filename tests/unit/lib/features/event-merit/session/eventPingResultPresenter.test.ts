import { describe, expect, it } from 'vitest';

import { presentEventPingResult } from '../../../../../../src/lib/features/event-merit/session/event-ping/eventPingResultPresenter';

describe('presentEventPingResult', () => {
	it('offers retry only when Discord did not accept the announcement', () => {
		expect(
			presentEventPingResult(
				{
					kind: 'announcement_failed',
					secondaryFailures: []
				},
				'req-1'
			).content
		).toContain('Please try again');
	});

	it('does not invite a duplicate after Discord acceptance but receipt failure', () => {
		const content = presentEventPingResult(
			{
				kind: 'receipt_failed',
				secondaryFailures: []
			},
			'req-2'
		).content;

		expect(content).toContain('Discord accepted');
		expect(content).toContain('Do not retry');
	});

	it('reports retry-control restoration failures accurately', () => {
		const content = presentEventPingResult(
			{
				kind: 'announcement_failed',
				secondaryFailures: ['restore_summary_sync']
			},
			'req-3'
		).content;

		expect(content).toContain('controls did not fully synchronize');
		expect(content).toContain('req-3');
	});

	it('reports incomplete tracking updates after a successful send', () => {
		const content = presentEventPingResult(
			{
				kind: 'sent',
				secondaryFailures: ['audit']
			},
			'req-4'
		).content;

		expect(content).toContain('Event Ping sent successfully.');
		expect(content).toContain('did not complete');
		expect(content).toContain('req-4');
	});
});
