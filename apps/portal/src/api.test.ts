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
