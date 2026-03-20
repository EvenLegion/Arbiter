import { EventSessionState } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { buildEventTrackingSummaryPayload } from '../../../../../../src/lib/features/event-merit/presentation/shared/buildEventTrackingSummaryPayload';
import { buildEventStartButtonId } from '../../../../../../src/lib/features/event-merit/session/buttons/eventStartButtonCustomId';

describe('buildEventTrackingSummaryPayload', () => {
	it('shows start and cancel controls while the event is still a draft', () => {
		const payload = buildEventTrackingSummaryPayload(createParams({ state: EventSessionState.DRAFT }));

		expect(payload.embeds).toHaveLength(1);
		expect(payload.components).toHaveLength(1);
		expect(payload.components[0].components.map((component) => component.data.label)).toEqual(['Start Event', 'Cancel Event']);
		expect(payload.components[0].components.map((component) => component.data.custom_id)).toEqual([
			buildEventStartButtonId({ action: 'confirm', eventSessionId: 77 }),
			buildEventStartButtonId({ action: 'cancel', eventSessionId: 77 })
		]);
	});

	it('shows only the end control while the event is active', () => {
		const payload = buildEventTrackingSummaryPayload(createParams({ state: EventSessionState.ACTIVE }));

		expect(payload.components).toHaveLength(1);
		expect(payload.components[0].components.map((component) => component.data.label)).toEqual(['End Event']);
		expect(payload.components[0].components[0].data.custom_id).toBe(buildEventStartButtonId({ action: 'end', eventSessionId: 77 }));
	});

	it('returns a read-only payload once the event is no longer editable', () => {
		const payload = buildEventTrackingSummaryPayload(createParams({ state: EventSessionState.FINALIZED_WITH_MERITS }));

		expect(payload.embeds).toHaveLength(1);
		expect(payload.components).toEqual([]);
	});
});

function createParams(overrides: Partial<Parameters<typeof buildEventTrackingSummaryPayload>[0]> = {}) {
	return {
		eventSessionId: 77,
		eventName: 'Weekly Operation',
		tierName: 'Tier 3',
		tierMeritAmount: 6,
		hostDiscordUserId: 'host-1',
		trackedChannelIds: ['voice-1'],
		trackingThreadId: 'thread-1',
		state: EventSessionState.DRAFT,
		...overrides
	};
}
