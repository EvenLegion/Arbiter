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

	async function createSession(discordUserId: string, signal?: AbortSignal): Promise<{ sessionId: string; csrfToken: string }> {
		for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
			throwIfAborted(signal);
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
			if (stored) {
				try {
					throwIfAborted(signal);
					return { sessionId, csrfToken };
				} catch (error) {
					await store.revokeSession(sessionId);
					throw error;
				}
			}
		}
		throw new AuthFailure('service_unavailable');
	}

	async function readSession(sessionId: string | undefined, signal?: AbortSignal) {
		throwIfAborted(signal);
		if (!isOpaqueToken(sessionId)) throw new AuthFailure('unauthorized');
		const session = await store.readAndRefreshSession(sessionId, now(), sessionIdleTtlSeconds);
		throwIfAborted(signal);
		if (!session) throw new AuthFailure('unauthorized');
		return { sessionId, session };
	}

	async function resolveAuthorizedSession(sessionId: string | undefined, signal?: AbortSignal) {
		const current = await readSession(sessionId, signal);
		const identity = await repository.findStaffIdentityByDiscordUserId(current.session.discordUserId);
		throwIfAborted(signal);
		if (!identity) {
			await store.revokeSession(current.sessionId);
			throw new AuthFailure('forbidden');
		}
		return {
			current,
			result: {
				identity,
				csrfToken: current.session.csrfToken,
				idleExpiresAt: new Date(current.session.idleExpiresAtMs).toISOString(),
				absoluteExpiresAt: new Date(current.session.absoluteExpiresAtMs).toISOString()
			}
		};
	}

	return {
		beginOAuth: ({ redirectUri, bindingId, signal }) =>
			withServiceBoundary(async () => {
				throwIfAborted(signal);
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
					try {
						throwIfAborted(signal);
					} catch (error) {
						await store.consumeOAuthState(state);
						throw error;
					}
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
		completeOAuth: ({ code, state, bindingId, existingSessionId, signal }) =>
			withServiceBoundary(async () => {
				throwIfAborted(signal);
				if (!isOpaqueToken(state) || code.length < 1 || code.length > 512) throw new AuthFailure('invalid_oauth_state');
				const stateRecord = await store.consumeOAuthState(state);
				throwIfAborted(signal);
				if (!stateRecord || !opaqueTokenMatches(bindingId, stateRecord.bindingDigest) || !allowedRedirects.has(stateRecord.redirectUri)) {
					throw new AuthFailure('invalid_oauth_state');
				}
				let discordUserId: string;
				try {
					discordUserId = await oauthClient.resolveDiscordUserId(code, signal);
				} catch {
					throwIfAborted(signal);
					throw new AuthFailure('oauth_failed');
				}
				throwIfAborted(signal);
				const identity = await repository.findStaffIdentityByDiscordUserId(discordUserId);
				throwIfAborted(signal);
				if (!identity) throw new AuthFailure('forbidden');
				const session = await createSession(identity.discordUserId, signal);
				try {
					if (isOpaqueToken(existingSessionId)) await store.revokeSession(existingSessionId);
					throwIfAborted(signal);
					return { sessionId: session.sessionId, redirectUri: stateRecord.redirectUri };
				} catch (error) {
					await store.revokeSession(session.sessionId);
					throw error;
				}
			}),
		requireSession: (sessionId, signal) =>
			withServiceBoundary(async () => {
				return (await resolveAuthorizedSession(sessionId, signal)).result;
			}),
		requireMutationSession: (sessionId, csrfToken, signal) =>
			withServiceBoundary(async () => {
				const authorized = await resolveAuthorizedSession(sessionId, signal);
				if (!opaqueTokensEqual(csrfToken, authorized.current.session.csrfToken)) throw new AuthFailure('csrf_failed');
				return authorized.result;
			}),
		logout: (sessionId, csrfToken, signal) =>
			withServiceBoundary(async () => {
				const current = await readSession(sessionId, signal);
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

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Authentication request aborted');
}
