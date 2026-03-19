import { describe, expect, it } from 'vitest';

import { computeEventDurationSeconds } from '../../../../../../src/lib/services/event-lifecycle';

describe('computeEventDurationSeconds', () => {
	it('returns zero when startedAt is null', () => {
		expect(
			computeEventDurationSeconds({
				startedAt: null,
				endedAt: new Date('2026-03-14T12:00:00.000Z')
			})
		).toBe(0);
	});

	it('returns zero when endedAt is null', () => {
		expect(
			computeEventDurationSeconds({
				startedAt: new Date('2026-03-14T12:00:00.000Z'),
				endedAt: null
			})
		).toBe(0);
	});

	it('returns the positive duration in seconds', () => {
		expect(
			computeEventDurationSeconds({
				startedAt: new Date('2026-03-14T12:00:00.000Z'),
				endedAt: new Date('2026-03-14T12:15:30.000Z')
			})
		).toBe(930);
	});

	it('clamps negative durations to zero', () => {
		expect(
			computeEventDurationSeconds({
				startedAt: new Date('2026-03-14T12:15:30.000Z'),
				endedAt: new Date('2026-03-14T12:00:00.000Z')
			})
		).toBe(0);
	});
});
