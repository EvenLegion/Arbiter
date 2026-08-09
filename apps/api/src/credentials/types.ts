import type { ApiCredentialMetadata, ApiIntegrationRegistryItem, ApiScope } from '@arbiter/api-contracts';

// This is a trusted application context, not transport input. The API auth
// boundary must resolve the canonical user and STAFF/EXEC role before calling
// these services; callers must never construct it from request fields.
export type ApiCredentialActor = {
	userId: string;
	role: 'STAFF' | 'EXEC';
};

export type ApiIntegrationRecord = {
	id: string;
	name: string;
	nameKey: string;
	purpose: string;
	state: 'ACTIVE' | 'ARCHIVED';
	createdByUserId: string;
	updatedByUserId: string;
	archivedByUserId: string | null;
	archivedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

export type ApiIntegrationRegistryRecord = ApiIntegrationRecord & {
	creatorDiscordUsername: string;
	creatorDiscordNickname: string;
	credentialCount: number;
};

export type ApiCredentialRecord = {
	id: string;
	integrationId: string;
	label: string;
	prefix: string;
	verifier: string;
	scopes: ApiScope[];
	expiresAt: Date;
	createdByUserId: string;
	revokedByUserId: string | null;
	revokedAt: Date | null;
	lastUsedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

export type ApiCredentialWithIntegrationRecord = ApiCredentialRecord & {
	integration: ApiIntegrationRecord;
};

export type ApiCredentialAuthentication = {
	credentialId: string;
	integrationId: string;
	integrationName: string;
	prefix: string;
	scopes: ApiScope[];
};

export type ApiCredentialMintResult = {
	credential: ApiCredentialMetadata;
	secret: string;
};

export type ApiCredentialServiceErrorCode =
	| 'conflict'
	| 'forbidden'
	| 'integration_archived'
	| 'invalid_credential'
	| 'invalid_input'
	| 'not_found'
	| 'stale';

export type ApiCredentialServiceResult<T> = { ok: true; value: T } | { ok: false; error: { code: ApiCredentialServiceErrorCode } };

export type ApiCredentialRepository = {
	createIntegration: (
		input: {
			name: string;
			nameKey: string;
			purpose: string;
			actorUserId: string;
		},
		signal?: AbortSignal
	) => Promise<{ status: 'created'; integration: ApiIntegrationRegistryRecord } | { status: 'conflict' }>;
	findIntegrationById: (id: string) => Promise<ApiIntegrationRecord | null>;
	listIntegrations: (includeArchived: boolean) => Promise<ApiIntegrationRegistryRecord[]>;
	updateIntegration: (
		input: {
			id: string;
			name: string;
			nameKey: string;
			purpose: string;
			actorUserId: string;
			expectedUpdatedAt: Date;
		},
		signal?: AbortSignal
	) => Promise<
		| { status: 'updated'; integration: ApiIntegrationRegistryRecord }
		| { status: 'conflict' }
		| { status: 'inactive' }
		| { status: 'not_found' }
		| { status: 'stale' }
	>;
	archiveIntegration: (
		input: {
			id: string;
			actorUserId: string;
			archivedAt: Date;
			expectedUpdatedAt: Date;
		},
		signal?: AbortSignal
	) => Promise<
		{ status: 'archived' | 'already_archived'; integration: ApiIntegrationRegistryRecord } | { status: 'not_found' } | { status: 'stale' }
	>;
	mintCredential: (input: {
		integrationId: string;
		label: string;
		prefix: string;
		verifier: string;
		scopes: ApiScope[];
		expiresAt: Date;
		actorUserId: string;
	}) => Promise<
		| { status: 'created'; credential: ApiCredentialWithIntegrationRecord }
		| { status: 'integration_archived' }
		| { status: 'integration_not_found' }
		| { status: 'prefix_conflict' }
	>;
	findCredentialById: (id: string) => Promise<ApiCredentialWithIntegrationRecord | null>;
	findCredentialByPrefix: (prefix: string) => Promise<ApiCredentialWithIntegrationRecord | null>;
	listCredentials: (integrationId: string) => Promise<ApiCredentialWithIntegrationRecord[]>;
	revokeCredential: (
		id: string,
		actorUserId: string,
		revokedAt: Date
	) => Promise<{ status: 'revoked' | 'already_revoked'; credential: ApiCredentialWithIntegrationRecord } | { status: 'not_found' }>;
	touchLastUsed: (id: string, usedAt: Date, staleBefore: Date) => Promise<boolean>;
};

export type ApiCredentialService = {
	createIntegration: (
		actor: ApiCredentialActor,
		input: { name: string; purpose: string },
		signal?: AbortSignal
	) => Promise<ApiCredentialServiceResult<ApiIntegrationRegistryItem>>;
	listIntegrations: (actor: ApiCredentialActor, includeArchived?: boolean) => Promise<ApiCredentialServiceResult<ApiIntegrationRegistryItem[]>>;
	editIntegration: (
		actor: ApiCredentialActor,
		input: { integrationId: string; name: string; purpose: string; expectedUpdatedAt: string },
		signal?: AbortSignal
	) => Promise<ApiCredentialServiceResult<ApiIntegrationRegistryItem>>;
	archiveIntegration: (
		actor: ApiCredentialActor,
		input: { integrationId: string; expectedUpdatedAt: string },
		signal?: AbortSignal
	) => Promise<ApiCredentialServiceResult<ApiIntegrationRegistryItem>>;
	mintCredential: (
		actor: ApiCredentialActor,
		input: { integrationId: string; label: string; scopes: readonly ApiScope[]; expiresAt?: Date }
	) => Promise<ApiCredentialServiceResult<ApiCredentialMintResult>>;
	listCredentials: (actor: ApiCredentialActor, integrationId: string) => Promise<ApiCredentialServiceResult<ApiCredentialMetadata[]>>;
	authenticate: (secret: string) => Promise<ApiCredentialServiceResult<ApiCredentialAuthentication>>;
	revokeCredential: (actor: ApiCredentialActor, credentialId: string) => Promise<ApiCredentialServiceResult<ApiCredentialMetadata>>;
};
