import { describe, expect, it, vi } from 'vitest';

import { createPortalApi, PortalApiError } from './api';

const REQUEST_ID = 'portal-request-1';

describe('portal API mapping', () => {
	it('uses credentialed session and CSRF requests and validates safe responses', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					data: {
						id: 'd3234d29-3990-412c-a8d3-10db55d9e49f',
						name: 'Directory client',
						purpose: 'Read users',
						state: 'active',
						createdByUserId: '33b20a61-1e86-4115-b999-f319808d5a87',
						updatedByUserId: '33b20a61-1e86-4115-b999-f319808d5a87',
						archivedByUserId: null,
						archivedAt: null,
						createdAt: '2026-08-09T08:00:00.000Z',
						updatedAt: '2026-08-09T08:00:00.000Z',
						creator: {
							userId: '33b20a61-1e86-4115-b999-f319808d5a87',
							discordUsername: 'staff-user',
							discordNickname: 'Staff User'
						},
						credentialCount: 0
					},
					meta: { requestId: REQUEST_ID }
				})
			)
		);
		const api = createPortalApi({ apiBaseUrl: 'https://api.example' }, fetchImpl);
		const result = await api.createIntegration('csrf-token', { name: 'Directory client', purpose: 'Read users' });

		expect(result.credentialCount).toBe(0);
		expect(fetchImpl).toHaveBeenCalledWith(
			'https://api.example/api/v1/integrations',
			expect.objectContaining({
				method: 'POST',
				credentials: 'include',
				headers: expect.objectContaining({ 'x-csrf-token': 'csrf-token' })
			})
		);
	});

	it('lists metadata, mints one secret response, and revokes through session-bound CSRF routes', async () => {
		const integrationId = 'd3234d29-3990-412c-a8d3-10db55d9e49f';
		const credentialId = '37513880-ac97-4333-b21f-eb919fa07957';
		const secret = 'arb_v1_AbCdEfGhIjKl_abcdefghijklmnopqrstuvwxyzABCDEFGH123456789';
		const credential = {
			id: credentialId,
			integrationId,
			label: 'Portal reader',
			prefix: 'AbCdEfGhIjKl',
			scopes: ['users:read'],
			status: 'active',
			createdByUserId: '33b20a61-1e86-4115-b999-f319808d5a87',
			creator: {
				userId: '33b20a61-1e86-4115-b999-f319808d5a87',
				discordUsername: 'staff-user',
				discordNickname: 'Staff User'
			},
			expiresAt: '2027-08-09T08:00:00.000Z',
			revokedByUserId: null,
			revokedAt: null,
			lastUsedAt: null,
			createdAt: '2026-08-09T08:00:00.000Z',
			updatedAt: '2026-08-09T08:00:00.000Z'
		};
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(JSON.stringify({ data: { credentials: [credential] }, meta: { requestId: REQUEST_ID } })))
			.mockResolvedValueOnce(new Response(JSON.stringify({ data: { credential, secret }, meta: { requestId: REQUEST_ID } })))
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						data: { ...credential, status: 'revoked', revokedAt: '2026-08-10T08:00:00.000Z' },
						meta: { requestId: REQUEST_ID }
					})
				)
			);
		const api = createPortalApi({ apiBaseUrl: 'https://api.example' }, fetchImpl);

		await expect(api.listCredentials(integrationId)).resolves.toEqual([credential]);
		await expect(api.mintCredential('csrf-token', integrationId, { label: 'Portal reader', scopes: ['users:read'] })).resolves.toEqual({
			credential,
			secret
		});
		await expect(api.revokeCredential('csrf-token', integrationId, credentialId)).resolves.toMatchObject({ status: 'revoked' });

		expect(fetchImpl.mock.calls[0]?.[0]).toBe(`https://api.example/api/v1/integrations/${integrationId}/credentials`);
		expect(fetchImpl.mock.calls[1]?.[1]).toEqual(
			expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'x-csrf-token': 'csrf-token' }) })
		);
		expect(fetchImpl.mock.calls[2]?.[0]).toBe(`https://api.example/api/v1/integrations/${integrationId}/credentials/${credentialId}/revoke`);
	});

	it('maps typed API errors without exposing raw response data', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify({ error: { code: 'stale', message: 'Refresh first', requestId: REQUEST_ID } }), {
				status: 409
			})
		);
		const api = createPortalApi({ apiBaseUrl: 'https://api.example' }, fetchImpl);

		await expect(api.archiveIntegration('csrf-token', 'd3234d29-3990-412c-a8d3-10db55d9e49f', '2026-08-09T08:00:00.000Z')).rejects.toEqual(
			expect.objectContaining<Partial<PortalApiError>>({ code: 'stale', status: 409, requestId: REQUEST_ID })
		);
	});
});
