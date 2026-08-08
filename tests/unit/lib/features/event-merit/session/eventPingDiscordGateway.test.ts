import { EventSessionState } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
	buildEventPingAnnouncementPayload,
	buildEventPingAuditPayload
} from '../../../../../../src/lib/features/event-merit/session/event-ping/eventPingDiscordGateway';

const eventSession = {
	id: 42,
	name: '@everyone Dangerous <@123>',
	state: EventSessionState.ACTIVE,
	threadId: 'thread-42',
	eventPingSentAt: null,
	channels: []
};

describe('eventPingDiscordGateway payloads', () => {
	it('allows only the configured role mention and uses a deterministic enforced nonce', () => {
		const payload = buildEventPingAnnouncementPayload({
			eventSession,
			parentVoiceChannelId: 'voice-42',
			roleId: 'role-42'
		});

		expect(payload.content).toBe(
			"<@&role-42> **@everyone Dangerous <@123>** event has started! Please join <#voice-42> if you're interested in attending."
		);
		expect(payload.allowedMentions).toEqual({
			parse: [],
			roles: ['role-42'],
			users: [],
			repliedUser: false
		});
		expect(payload.nonce).toBe('event-ping-42');
		expect(payload.enforceNonce).toBe(true);
	});

	it('builds a public audit that names the clicker without creating another notification', () => {
		const payload = buildEventPingAuditPayload({
			eventSession,
			actorDiscordUserId: 'actor-42',
			outcome: 'sent'
		});

		expect(payload.content).toContain('requested by <@actor-42>');
		expect(payload.content).toContain('succeeded');
		expect(payload.allowedMentions.users).toEqual([]);
	});
});
