import type { ApiAuthIdentity } from '@arbiter/api-contracts';

export type OAuthStateRecord = {
	bindingDigest: string;
	redirectUri: string;
};

export type BrowserSessionRecord = {
	discordUserId: string;
	createdAtMs: number;
	lastSeenAtMs: number;
	absoluteExpiresAtMs: number;
	csrfToken: string;
};

export type BrowserSession = BrowserSessionRecord & {
	idleExpiresAtMs: number;
};

export type AuthStore = {
	putOAuthState: (state: string, record: OAuthStateRecord, ttlSeconds: number) => Promise<boolean>;
	consumeOAuthState: (state: string) => Promise<OAuthStateRecord | null>;
	putSession: (sessionId: string, record: BrowserSessionRecord, ttlSeconds: number) => Promise<boolean>;
	readAndRefreshSession: (sessionId: string, nowMs: number, idleTtlSeconds: number) => Promise<BrowserSession | null>;
	revokeSession: (sessionId: string) => Promise<void>;
};

export type AuthRepository = {
	findStaffIdentityByDiscordUserId: (discordUserId: string) => Promise<ApiAuthIdentity | null>;
};

export type DiscordOAuthClient = {
	resolveDiscordUserId: (code: string, signal?: AbortSignal) => Promise<string>;
};

export type AuthSessionResult = {
	identity: ApiAuthIdentity;
	csrfToken: string;
	idleExpiresAt: string;
	absoluteExpiresAt: string;
};

export type AuthService = {
	beginOAuth: (input: {
		redirectUri: string;
		bindingId?: string;
		signal?: AbortSignal;
	}) => Promise<{ authorizationUrl: string; bindingId: string }>;
	completeOAuth: (input: {
		code: string;
		state: string;
		bindingId?: string;
		existingSessionId?: string;
		signal?: AbortSignal;
	}) => Promise<{ sessionId: string; redirectUri: string }>;
	requireSession: (sessionId?: string, signal?: AbortSignal) => Promise<AuthSessionResult>;
	requireMutationSession: (sessionId: string | undefined, csrfToken: string | undefined, signal?: AbortSignal) => Promise<AuthSessionResult>;
	logout: (sessionId: string | undefined, csrfToken: string | undefined, signal?: AbortSignal) => Promise<void>;
};

export type AuthFailureCode =
	| 'invalid_oauth_state'
	| 'invalid_redirect'
	| 'oauth_failed'
	| 'unauthorized'
	| 'forbidden'
	| 'csrf_failed'
	| 'service_unavailable';

export class AuthFailure extends Error {
	public constructor(public readonly code: AuthFailureCode) {
		super(code);
		this.name = 'AuthFailure';
	}
}
