import { EventReviewDecisionKind, EventSessionState } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { buildEventReviewPayload } from '../../../../../../src/lib/features/event-merit/review/presentation/buildEventReviewPayload';

describe('buildEventReviewPayload', () => {
	it('preserves ten nonmember rows within Discord embed field limits', () => {
		const attendees = Array.from({ length: 10 }, (_, index) => ({
			meritEligibility: 'not_org_member' as const,
			dbUserId: `guest-${index}`,
			discordUserId: `123456789012345678${index}`,
			discordUsername: 'Guest',
			discordNickname: 'Guest',
			attendedSeconds: 3600,
			decision: EventReviewDecisionKind.MERIT
		}));
		const payload = buildEventReviewPayload({
			eventSessionId: 45,
			state: EventSessionState.ENDED_PENDING_REVIEW,
			durationSeconds: 3600,
			attendeeCount: 10,
			page: 1,
			totalPages: 1,
			pageSize: 10,
			attendees
		});
		const embed = payload.embeds[0].toJSON();
		const fields = embed.fields?.filter((field) => field.name.startsWith('Attendees')) ?? [];
		expect(fields.every((field) => field.value.length <= 1024)).toBe(true);
		for (const attendee of attendees) expect(fields.map((field) => field.value).join('\n')).toContain(`<@${attendee.discordUserId}>`);
	});

	it.each(['not_org_member', 'unavailable'] as const)('shows attendance and disables stale MERIT selections for %s', (meritEligibility) => {
		const payload = buildEventReviewPayload({
			eventSessionId: 45,
			state: EventSessionState.ENDED_PENDING_REVIEW,
			durationSeconds: 3600,
			attendeeCount: 1,
			page: 1,
			totalPages: 1,
			pageSize: 10,
			attendees: [
				{
					meritEligibility,
					dbUserId: 'outsider',
					discordUserId: 'outsider',
					discordUsername: 'Guest',
					discordNickname: 'Guest',
					attendedSeconds: 3600,
					decision: EventReviewDecisionKind.MERIT
				}
			]
		});
		const text = payload.embeds[0].data.fields?.find((field) => field.name === 'Attendees')?.value;
		expect(text).toContain('<@outsider> - 60 min (100%)');
		expect(text).toContain(
			meritEligibility === 'not_org_member' ? 'Not eligible for merit: not part of the org' : 'Merit eligibility unavailable'
		);
		expect(payload.components[1]?.components[0]?.data.disabled).toBe(true);
		expect(payload.components[1]?.components[0]?.data.style).toBe(4);
	});

	it('shows the expected duration while retaining actual duration, merit percentages, and editable selections', () => {
		const payload = buildEventReviewPayload({
			eventSessionId: 45,
			state: EventSessionState.ENDED_PENDING_REVIEW,
			durationSeconds: 7200,
			expectedEventDuration: 60,
			attendeeCount: 1,
			page: 1,
			totalPages: 1,
			pageSize: 10,
			attendees: [
				{
					meritEligibility: 'eligible',
					dbUserId: 'a',
					discordUserId: 'a',
					discordUsername: 'a',
					discordNickname: 'a',
					attendedSeconds: 1800,
					decision: null
				}
			]
		});
		expect(payload.embeds[0].data.description).toBe('Expected duration: 1h 0m.');
		expect(payload.embeds[0].data.fields?.find((field) => field.name === 'Duration')?.value).toBe('2h 0m');
		expect(payload.embeds[0].data.fields?.find((field) => field.name === 'Attendees')?.value).toContain('(50%)');
		expect(payload.components[1]?.components[0]?.data.style).toBe(3);
	});

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
					meritEligibility: 'eligible',
					dbUserId: 'db-user-1',
					discordUserId: '111',
					discordUsername: 'alpha',
					discordNickname: 'Alpha',
					attendedSeconds: 360,
					decision: null
				},
				{
					meritEligibility: 'eligible',
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
				meritEligibility: 'eligible',
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
