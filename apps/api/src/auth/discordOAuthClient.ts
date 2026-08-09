import { z } from 'zod';

import type { DiscordOAuthClient } from './types';

const DiscordTokenResponseSchema = z.object({ access_token: z.string().min(1), token_type: z.literal('Bearer') }).passthrough();
const DiscordIdentitySchema = z.object({ id: z.string().regex(/^\d{17,20}$/) }).passthrough();

export function createDiscordOAuthClient({
	clientId,
	clientSecret,
	callbackUrl,
	timeoutMs = 5_000,
	fetchImpl = fetch
}: {
	clientId: string;
	clientSecret: string;
	callbackUrl: string;
	timeoutMs?: number;
	fetchImpl?: typeof fetch;
}): DiscordOAuthClient {
	return {
		resolveDiscordUserId: async (code) => {
			const tokenResponse = await fetchImpl('https://discord.com/api/v10/oauth2/token', {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					client_id: clientId,
					client_secret: clientSecret,
					grant_type: 'authorization_code',
					code,
					redirect_uri: callbackUrl
				}),
				signal: AbortSignal.timeout(timeoutMs)
			});
			if (!tokenResponse.ok) throw new Error('Discord OAuth token exchange failed');
			const token = DiscordTokenResponseSchema.safeParse(await tokenResponse.json());
			if (!token.success) throw new Error('Discord OAuth token response was invalid');

			const identityResponse = await fetchImpl('https://discord.com/api/v10/users/@me', {
				headers: { authorization: `Bearer ${token.data.access_token}` },
				signal: AbortSignal.timeout(timeoutMs)
			});
			if (!identityResponse.ok) throw new Error('Discord OAuth identity lookup failed');
			const identity = DiscordIdentitySchema.safeParse(await identityResponse.json());
			if (!identity.success) throw new Error('Discord OAuth identity response was invalid');
			return identity.data.id;
		}
	};
}
