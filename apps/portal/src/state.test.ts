import type { ApiAuthIdentity, ApiIntegrationRegistryItem } from '@arbiter/api-contracts';
import { describe, expect, it } from 'vitest';

import { PortalApiError } from './api';
import { canArchiveIntegration, canEditIntegration, describePortalError, replaceIntegration } from './state';

const creator: ApiAuthIdentity = {
	userId: '33b20a61-1e86-4115-b999-f319808d5a87',
	discordUserId: '100000000000000001',
	discordUsername: 'creator',
	discordNickname: 'Creator',
	discordAvatarUrl: 'https://example.com/avatar.png',
	role: 'STAFF'
};
const integration: ApiIntegrationRegistryItem = {
	id: 'd3234d29-3990-412c-a8d3-10db55d9e49f',
	name: 'Directory client',
	purpose: 'Read users',
	state: 'active',
	createdByUserId: creator.userId,
	updatedByUserId: creator.userId,
	archivedByUserId: null,
	archivedAt: null,
	createdAt: '2026-08-09T08:00:00.000Z',
	updatedAt: '2026-08-09T08:00:00.000Z',
	creator: { userId: creator.userId, discordUsername: creator.discordUsername, discordNickname: creator.discordNickname },
	credentialCount: 1
};

describe('portal view policy', () => {
	it('shows creator edit and EXEC archive controls without treating client state as authority', () => {
		expect(canEditIntegration(creator, integration)).toBe(true);
		expect(canArchiveIntegration(creator, integration)).toBe(false);
		expect(canEditIntegration({ ...creator, userId: '1507b2bd-d5fa-47ab-b696-f984bce22be5' }, integration)).toBe(false);
		expect(canArchiveIntegration({ ...creator, role: 'EXEC' }, integration)).toBe(true);
		expect(canEditIntegration({ ...creator, role: 'EXEC' }, { ...integration, state: 'archived' })).toBe(false);
	});

	it('keeps archived replacements only when the archived view is enabled', () => {
		expect(replaceIntegration([integration], { ...integration, state: 'archived' }, false)).toEqual([]);
		expect(replaceIntegration([integration], { ...integration, state: 'archived' }, true)[0]?.state).toBe('archived');
	});

	it('maps typed outcomes to actionable safe copy', () => {
		expect(describePortalError(new PortalApiError('stale', 'raw', 409, 'request-1'))).toContain('refreshed');
		expect(describePortalError(new PortalApiError('stale', 'raw', 409, 'request-1'))).toContain('request-1');
		expect(describePortalError(new Error('database details'))).not.toContain('database');
	});
});
