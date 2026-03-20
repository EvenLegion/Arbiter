import { EventReviewDecisionKind, EventSessionState } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { buildEventReviewPayload } from '../../../../../../src/lib/features/event-merit/review/presentation/buildEventReviewPayload';

describe('buildEventReviewPayload', () => {
	it('builds submit controls and attendee decision rows while review is open', () => {
		const payload = buildEventReviewPayload({
			eventSessionId: 44,
			state: EventSessionState.ENDED_PENDING_REVIEW,
			durationSeconds: 600,
			attendeeCount: 2,
			page: 1,
			totalPages: 3,
			pageSize: 10,
			attendees: [
				{
					dbUserId: 'db-user-1',
					discordUserId: '111',
					discordUsername: 'alpha',
					discordNickname: 'Alpha',
					attendedSeconds: 360,
					decision: null
				},
				{
					dbUserId: 'db-user-2',
					discordUserId: '222',
					discordUsername: 'bravo',
					discordNickname: 'Bravo',
					attendedSeconds: 60,
					decision: EventReviewDecisionKind.NO_MERIT
				}
			]
		});

		expect(payload.embeds).toHaveLength(1);
		expect(payload.embeds[0].data.title).toBe('Event Merit Review');
		expect(payload.embeds[0].data.fields?.find((field) => field.name === 'Page')?.value).toBe('1/3');
		expect(payload.embeds[0].data.fields?.find((field) => field.name === 'Attendees')?.value).toContain('<@111>');
		expect(payload.components).toHaveLength(2);
		expect(payload.components[0].components.map((component) => component.data.label)).toEqual([
			'Prev',
			'Page 1/3',
			'Next',
			'Submit Without Merits',
			'Submit With Merits'
		]);
		expect(payload.components[0].components[0].data.disabled).toBe(true);
		expect(payload.components[0].components[2].data.disabled).toBe(false);
		expect(payload.components[1].components.map((component) => component.data.label)).toEqual(['Alpha', 'Bravo']);
		expect(payload.components[1].components[0].data.style).toBe(3);
		expect(payload.components[1].components[1].data.style).toBe(4);
	});

	it('packs attendee toggle buttons into rows of five', () => {
		const payload = buildEventReviewPayload({
			eventSessionId: 77,
			state: EventSessionState.ENDED_PENDING_REVIEW,
			durationSeconds: 600,
			attendeeCount: 7,
			page: 1,
			totalPages: 1,
			pageSize: 10,
			attendees: Array.from({ length: 7 }, (_, index) => ({
				dbUserId: `db-user-${index + 1}`,
				discordUserId: `${index + 1}`,
				discordUsername: `user-${index + 1}`,
				discordNickname: `User ${index + 1}`,
				attendedSeconds: 600,
				decision: EventReviewDecisionKind.MERIT
			}))
		});

		expect(payload.components).toHaveLength(3);
		expect(payload.components[1].components).toHaveLength(5);
		expect(payload.components[2].components).toHaveLength(2);
	});

	it('returns navigation-only controls after review has closed', () => {
		const payload = buildEventReviewPayload({
			eventSessionId: 55,
			state: EventSessionState.FINALIZED_NO_MERITS,
			durationSeconds: 120,
			attendeeCount: 0,
			page: 2,
			totalPages: 2,
			pageSize: 10,
			attendees: []
		});

		expect(payload.components).toHaveLength(1);
		expect(payload.components[0].components.map((component) => component.data.label)).toEqual(['Prev', 'Page 2/2', 'Next']);
		expect(payload.components[0].components[0].data.disabled).toBe(false);
		expect(payload.components[0].components[2].data.disabled).toBe(true);
	});
});
