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
		resolveDiscordUserId: async (code, signal) => {
			const token = await withDeadline(signal, timeoutMs, async (deadlineSignal) => {
				const response = await fetchImpl('https://discord.com/api/v10/oauth2/token', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({
						client_id: clientId,
						client_secret: clientSecret,
						grant_type: 'authorization_code',
						code,
						redirect_uri: callbackUrl
					}),
					signal: deadlineSignal
				});
				if (!response.ok) throw new Error('Discord OAuth token exchange failed');
				const parsed = DiscordTokenResponseSchema.safeParse(await response.json());
				if (!parsed.success) throw new Error('Discord OAuth token response was invalid');
				return parsed.data;
			});

			return withDeadline(signal, timeoutMs, async (deadlineSignal) => {
				const response = await fetchImpl('https://discord.com/api/v10/users/@me', {
					headers: { authorization: `Bearer ${token.access_token}` },
					signal: deadlineSignal
				});
				if (!response.ok) throw new Error('Discord OAuth identity lookup failed');
				const identity = DiscordIdentitySchema.safeParse(await response.json());
				if (!identity.success) throw new Error('Discord OAuth identity response was invalid');
				return identity.data.id;
			});
		}
	};
}

async function withDeadline<T>(
	requestSignal: AbortSignal | undefined,
	timeoutMs: number,
	operation: (signal: AbortSignal) => Promise<T>
): Promise<T> {
	const controller = new AbortController();
	const abortFromRequest = () => controller.abort(requestSignal?.reason);
	if (requestSignal?.aborted) abortFromRequest();
	else requestSignal?.addEventListener('abort', abortFromRequest, { once: true });
	const timeout = setTimeout(() => controller.abort(new Error('Discord OAuth request timed out')), timeoutMs);
	try {
		return await operation(controller.signal);
	} finally {
		clearTimeout(timeout);
		requestSignal?.removeEventListener('abort', abortFromRequest);
	}
}
