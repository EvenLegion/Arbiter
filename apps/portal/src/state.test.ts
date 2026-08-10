import type { ApiAuthIdentity, ApiCredentialMetadata, ApiIntegrationRegistryItem } from '@arbiter/api-contracts';
import { describe, expect, it } from 'vitest';

import { PortalApiError } from './api';
import {
	canArchiveIntegration,
	canEditIntegration,
	canRevokeCredential,
	credentialDetailPath,
	describePortalError,
	isPortalError,
	parsePortalRoute,
	replaceCredential,
	replaceIntegration,
	transitionOneTimeSecret
} from './state';

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
const credential: ApiCredentialMetadata = {
	id: '37513880-ac97-4333-b21f-eb919fa07957',
	integrationId: integration.id,
	label: 'Reader',
	prefix: 'AbCdEfGhIjKl',
	scopes: ['users:read'],
	status: 'active',
	createdByUserId: creator.userId,
	creator: { userId: creator.userId, discordUsername: creator.discordUsername, discordNickname: creator.discordNickname },
	expiresAt: '2027-08-09T08:00:00.000Z',
	revokedByUserId: null,
	revokedAt: null,
	lastUsedAt: null,
	createdAt: '2026-08-09T08:00:00.000Z',
	updatedAt: '2026-08-09T08:00:00.000Z'
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

	it('shows revoke only to the creator or EXEC and preserves authoritative metadata ordering', () => {
		expect(canRevokeCredential(creator, credential)).toBe(true);
		expect(canRevokeCredential({ ...creator, userId: '1507b2bd-d5fa-47ab-b696-f984bce22be5' }, credential)).toBe(false);
		expect(canRevokeCredential({ ...creator, role: 'EXEC', userId: '1507b2bd-d5fa-47ab-b696-f984bce22be5' }, credential)).toBe(true);
		expect(canRevokeCredential(creator, { ...credential, status: 'revoked', revokedAt: '2026-08-10T08:00:00.000Z' })).toBe(false);
		expect(canRevokeCredential(creator, { ...credential, status: 'integration_archived' })).toBe(true);
		expect(replaceCredential([credential], { ...credential, status: 'revoked', revokedAt: '2026-08-10T08:00:00.000Z' })).toHaveLength(1);
	});

	it('supports direct credential routes and clears one-time secret state on every navigation or refresh', () => {
		const path = credentialDetailPath(integration.id);
		expect(parsePortalRoute(path)).toEqual({ kind: 'credentials', integrationId: integration.id });
		expect(parsePortalRoute('/auth/callback')).toEqual({ kind: 'registry' });
		const revealed = transitionOneTimeSecret(null, { type: 'reveal', value: { credential, secret: 'one-time-secret' } });
		expect(revealed?.secret).toBe('one-time-secret');
		expect(transitionOneTimeSecret(revealed, { type: 'navigate' })).toBeNull();
		expect(transitionOneTimeSecret(revealed, { type: 'refresh' })).toBeNull();
		expect(transitionOneTimeSecret(revealed, { type: 'dismiss' })).toBeNull();
	});

	it('maps typed outcomes to actionable safe copy', () => {
		expect(describePortalError(new PortalApiError('stale', 'raw', 409, 'request-1'))).toContain('refreshed');
		expect(describePortalError(new PortalApiError('stale', 'raw', 409, 'request-1'))).toContain('request-1');
		expect(describePortalError(new Error('database details'))).not.toContain('database');
	});

	it('classifies only the requested typed portal errors', () => {
		expect(isPortalError(new PortalApiError('unauthorized', 'raw', 401, null), 'unauthorized')).toBe(true);
		expect(
			isPortalError(new PortalApiError('request_timeout', 'raw', 408, null), 'network_error', 'request_timeout', 'service_unavailable')
		).toBe(true);
		expect(
			isPortalError(new PortalApiError('service_unavailable', 'raw', 503, null), 'network_error', 'request_timeout', 'service_unavailable')
		).toBe(true);
		expect(isPortalError(new PortalApiError('stale', 'raw', 409, null), 'network_error', 'request_timeout', 'service_unavailable')).toBe(false);
		expect(isPortalError(new Error('network'), 'network_error')).toBe(false);
	});
});
