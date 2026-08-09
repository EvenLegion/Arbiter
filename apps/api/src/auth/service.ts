import { digestOpaqueToken, generateOpaqueToken, isOpaqueToken, opaqueTokenMatches, opaqueTokensEqual } from './crypto';
import { AuthFailure, type AuthRepository, type AuthService, type AuthStore, type DiscordOAuthClient } from './types';

const MAX_CREATE_ATTEMPTS = 3;

export function createAuthService({
	store,
	repository,
	oauthClient,
	clientId,
	callbackUrl,
	allowedRedirectUrls,
	stateTtlSeconds,
	sessionIdleTtlSeconds,
	sessionAbsoluteTtlSeconds,
	now = () => Date.now()
}: {
	store: AuthStore;
	repository: AuthRepository;
	oauthClient: DiscordOAuthClient;
	clientId: string;
	callbackUrl: string;
	allowedRedirectUrls: readonly string[];
	stateTtlSeconds: number;
	sessionIdleTtlSeconds: number;
	sessionAbsoluteTtlSeconds: number;
	now?: () => number;
}): AuthService {
	const allowedRedirects = new Set(allowedRedirectUrls);

	async function createSession(discordUserId: string): Promise<{ sessionId: string; csrfToken: string }> {
		for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
			const sessionId = generateOpaqueToken();
			const csrfToken = generateOpaqueToken();
			const nowMs = now();
			const stored = await store.putSession(
				sessionId,
				{
					discordUserId,
					createdAtMs: nowMs,
					lastSeenAtMs: nowMs,
					absoluteExpiresAtMs: nowMs + sessionAbsoluteTtlSeconds * 1_000,
					csrfToken
				},
				sessionIdleTtlSeconds
			);
			if (stored) return { sessionId, csrfToken };
		}
		throw new AuthFailure('service_unavailable');
	}

	async function readSession(sessionId: string | undefined) {
		if (!isOpaqueToken(sessionId)) throw new AuthFailure('unauthorized');
		const session = await store.readAndRefreshSession(sessionId, now(), sessionIdleTtlSeconds);
		if (!session) throw new AuthFailure('unauthorized');
		return { sessionId, session };
	}

	return {
		beginOAuth: ({ redirectUri, bindingId }) =>
			withServiceBoundary(async () => {
				if (!allowedRedirects.has(redirectUri)) throw new AuthFailure('invalid_redirect');
				const resolvedBindingId = isOpaqueToken(bindingId) ? bindingId : generateOpaqueToken();
				for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
					const state = generateOpaqueToken();
					const stored = await store.putOAuthState(
						state,
						{ bindingDigest: digestOpaqueToken(resolvedBindingId), redirectUri },
						stateTtlSeconds
					);
					if (!stored) continue;
					const authorizationUrl = new URL('https://discord.com/oauth2/authorize');
					authorizationUrl.search = new URLSearchParams({
						client_id: clientId,
						response_type: 'code',
						redirect_uri: callbackUrl,
						scope: 'identify',
						state
					}).toString();
					return { authorizationUrl: authorizationUrl.toString(), bindingId: resolvedBindingId };
				}
				throw new AuthFailure('service_unavailable');
			}),
		completeOAuth: ({ code, state, bindingId, existingSessionId }) =>
			withServiceBoundary(async () => {
				if (!isOpaqueToken(state) || code.length < 1 || code.length > 512) throw new AuthFailure('invalid_oauth_state');
				const stateRecord = await store.consumeOAuthState(state);
				if (!stateRecord || !opaqueTokenMatches(bindingId, stateRecord.bindingDigest) || !allowedRedirects.has(stateRecord.redirectUri)) {
					throw new AuthFailure('invalid_oauth_state');
				}
				let discordUserId: string;
				try {
					discordUserId = await oauthClient.resolveDiscordUserId(code);
				} catch {
					throw new AuthFailure('oauth_failed');
				}
				const identity = await repository.findStaffIdentityByDiscordUserId(discordUserId);
				if (!identity) throw new AuthFailure('forbidden');
				if (isOpaqueToken(existingSessionId)) await store.revokeSession(existingSessionId);
				const session = await createSession(identity.discordUserId);
				return { sessionId: session.sessionId, redirectUri: stateRecord.redirectUri };
			}),
		requireSession: (sessionId) =>
			withServiceBoundary(async () => {
				const current = await readSession(sessionId);
				const identity = await repository.findStaffIdentityByDiscordUserId(current.session.discordUserId);
				if (!identity) {
					await store.revokeSession(current.sessionId);
					throw new AuthFailure('forbidden');
				}
				return {
					identity,
					csrfToken: current.session.csrfToken,
					idleExpiresAt: new Date(current.session.idleExpiresAtMs).toISOString(),
					absoluteExpiresAt: new Date(current.session.absoluteExpiresAtMs).toISOString()
				};
			}),
		logout: (sessionId, csrfToken) =>
			withServiceBoundary(async () => {
				const current = await readSession(sessionId);
				if (!opaqueTokensEqual(csrfToken, current.session.csrfToken)) throw new AuthFailure('csrf_failed');
				await store.revokeSession(current.sessionId);
			})
	};
}

async function withServiceBoundary<T>(operation: () => Promise<T>): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		if (error instanceof AuthFailure) throw error;
		throw new AuthFailure('service_unavailable');
	}
}
