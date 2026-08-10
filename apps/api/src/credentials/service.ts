import {
	ApiScopeSchema,
	normalizeApiScopes,
	type ApiCredentialMetadata,
	type ApiCredentialStatus,
	type ApiIntegrationRegistryItem
} from '@arbiter/api-contracts';
import { z } from 'zod';

import { createApiCredentialVerifier, generateApiCredential, parseApiCredentialPrefix, verifyApiCredentialSecret } from './crypto';
import type {
	ApiCredentialActor,
	ApiCredentialRepository,
	ApiCredentialService,
	ApiCredentialServiceErrorCode,
	ApiCredentialServiceResult,
	ApiCredentialWithIntegrationRecord,
	ApiIntegrationRegistryRecord
} from './types';

const ActorSchema = z.object({ userId: z.uuid(), role: z.enum(['STAFF', 'EXEC']) });
const IntegrationInputSchema = z.object({ name: z.string().trim().min(1).max(100), purpose: z.string().trim().min(1).max(500) });
const ExpectedUpdatedAtSchema = z.iso.datetime({ offset: true });
const IdSchema = z.uuid();
const LabelSchema = z.string().trim().min(1).max(100);
const ScopeListSchema = z.array(ApiScopeSchema).min(1).max(1);
const MAX_PREFIX_ATTEMPTS = 5;
const LAST_USE_WRITE_INTERVAL_MS = 5 * 60 * 1_000;
const DUMMY_SECRET = 'arb_v1_AAAAAAAAAAAA_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export function createApiCredentialService({
	repository,
	pepper,
	now = () => new Date(),
	generateCredential = generateApiCredential,
	lastUseWriteIntervalMs = LAST_USE_WRITE_INTERVAL_MS
}: {
	repository: ApiCredentialRepository;
	pepper: string;
	now?: () => Date;
	generateCredential?: typeof generateApiCredential;
	lastUseWriteIntervalMs?: number;
}): ApiCredentialService {
	if (pepper.length < 32) throw new Error('API credential pepper must be at least 32 characters');

	return {
		createIntegration: async (actor, input, signal) => {
			if (!isValidActor(actor)) return failure('invalid_input');
			const parsed = IntegrationInputSchema.safeParse(input);
			if (!parsed.success) return failure('invalid_input');
			const result = await repository.createIntegration(
				{
					...parsed.data,
					nameKey: normalizeIntegrationName(parsed.data.name),
					actorUserId: actor.userId
				},
				signal
			);
			return result.status === 'conflict' ? failure('conflict') : success(toIntegrationDto(result.integration));
		},
		listIntegrations: async (actor, includeArchived = false) => {
			if (!isValidActor(actor)) return failure('invalid_input');
			const integrations = await repository.listIntegrations(includeArchived);
			return success(integrations.map(toIntegrationDto));
		},
		editIntegration: async (actor, input, signal) => {
			if (!isValidActor(actor)) return failure('invalid_input');
			const parsed = IntegrationInputSchema.extend({ integrationId: IdSchema, expectedUpdatedAt: ExpectedUpdatedAtSchema }).safeParse(input);
			if (!parsed.success) return failure('invalid_input');
			const existing = await repository.findIntegrationById(parsed.data.integrationId);
			if (!existing) return failure('not_found');
			if (actor.role !== 'EXEC' && existing.createdByUserId !== actor.userId) return failure('forbidden');
			if (existing.state === 'ARCHIVED') return failure('integration_archived');
			const result = await repository.updateIntegration(
				{
					id: existing.id,
					name: parsed.data.name,
					nameKey: normalizeIntegrationName(parsed.data.name),
					purpose: parsed.data.purpose,
					actorUserId: actor.userId,
					expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt)
				},
				signal
			);
			if (result.status === 'conflict') return failure('conflict');
			if (result.status === 'not_found') return failure('not_found');
			if (result.status === 'inactive') return failure('integration_archived');
			if (result.status === 'stale') return failure('stale');
			return success(toIntegrationDto(result.integration));
		},
		archiveIntegration: async (actor, input, signal) => {
			if (!isValidActor(actor)) return failure('invalid_input');
			const parsed = z.object({ integrationId: IdSchema, expectedUpdatedAt: ExpectedUpdatedAtSchema }).safeParse(input);
			if (!parsed.success) return failure('invalid_input');
			if (actor.role !== 'EXEC') return failure('forbidden');
			const result = await repository.archiveIntegration(
				{
					id: parsed.data.integrationId,
					actorUserId: actor.userId,
					archivedAt: now(),
					expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt)
				},
				signal
			);
			if (result.status === 'not_found') return failure('not_found');
			if (result.status === 'stale') return failure('stale');
			return success(toIntegrationDto(result.integration));
		},
		mintCredential: async (actor, input) => {
			if (!isValidActor(actor)) return failure('invalid_input');
			const inputSchema = z.object({
				integrationId: IdSchema,
				label: LabelSchema,
				scopes: ScopeListSchema,
				expiresAt: z.date().optional()
			});
			const parsed = inputSchema.safeParse(input);
			if (!parsed.success) return failure('invalid_input');
			const scopes = normalizeApiScopes(parsed.data.scopes);
			if (scopes.length !== parsed.data.scopes.length || scopes.length !== 1 || scopes[0] !== 'users:read') return failure('invalid_input');

			const issuedAt = now();
			const maximumExpiry = oneYearAfter(issuedAt);
			const expiresAt = parsed.data.expiresAt ?? maximumExpiry;
			if (expiresAt <= issuedAt || expiresAt > maximumExpiry) return failure('invalid_input');

			for (let attempt = 0; attempt < MAX_PREFIX_ATTEMPTS; attempt += 1) {
				const generated = generateCredential();
				const result = await repository.mintCredential({
					integrationId: parsed.data.integrationId,
					label: parsed.data.label,
					prefix: generated.prefix,
					verifier: createApiCredentialVerifier(generated.secret, pepper),
					scopes,
					expiresAt,
					actorUserId: actor.userId
				});
				if (result.status === 'prefix_conflict') continue;
				if (result.status === 'integration_not_found') return failure('not_found');
				if (result.status === 'integration_archived') return failure('integration_archived');
				return success({ credential: toCredentialDto(result.credential, issuedAt), secret: generated.secret });
			}
			return failure('conflict');
		},
		listCredentials: async (actor, integrationId) => {
			if (!isValidActor(actor) || !IdSchema.safeParse(integrationId).success) return failure('invalid_input');
			const integration = await repository.findIntegrationById(integrationId);
			if (!integration) return failure('not_found');
			const timestamp = now();
			const credentials = await repository.listCredentials(integrationId);
			return success(credentials.map((credential) => toCredentialDto(credential, timestamp)));
		},
		authenticate: async (secret, signal, deadlineAtMs) => {
			signal?.throwIfAborted();
			const prefix = parseApiCredentialPrefix(secret);
			if (!prefix) return failure('invalid_credential');
			const credential = await repository.findCredentialByPrefix(prefix, signal, deadlineAtMs);
			signal?.throwIfAborted();
			const expectedVerifier = credential?.verifier ?? createApiCredentialVerifier(DUMMY_SECRET, pepper);
			if (!verifyApiCredentialSecret(secret, expectedVerifier, pepper) || !credential) return failure('invalid_credential');
			const authenticatedAt = now();
			if (credential.revokedAt || credential.expiresAt <= authenticatedAt || credential.integration.state === 'ARCHIVED') {
				return failure('invalid_credential');
			}
			await repository.touchLastUsed(
				credential.id,
				authenticatedAt,
				new Date(authenticatedAt.getTime() - lastUseWriteIntervalMs),
				signal,
				deadlineAtMs
			);
			signal?.throwIfAborted();
			return success({
				credentialId: credential.id,
				integrationId: credential.integrationId,
				integrationName: credential.integration.name,
				prefix: credential.prefix,
				scopes: credential.scopes
			});
		},
		revokeCredential: async (actor, credentialId) => {
			if (!isValidActor(actor) || !IdSchema.safeParse(credentialId).success) return failure('invalid_input');
			const existing = await repository.findCredentialById(credentialId);
			if (!existing) return failure('not_found');
			if (actor.role !== 'EXEC' && existing.createdByUserId !== actor.userId) return failure('forbidden');
			const revokedAt = now();
			const result = await repository.revokeCredential(credentialId, actor.userId, revokedAt);
			return result.status === 'not_found' ? failure('not_found') : success(toCredentialDto(result.credential, revokedAt));
		}
	};
}

function normalizeIntegrationName(name: string): string {
	return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function oneYearAfter(date: Date): Date {
	const result = new Date(date);
	result.setUTCFullYear(result.getUTCFullYear() + 1);
	return result;
}

function isValidActor(actor: ApiCredentialActor): boolean {
	return ActorSchema.safeParse(actor).success;
}

function toIntegrationDto(integration: ApiIntegrationRegistryRecord): ApiIntegrationRegistryItem {
	return {
		id: integration.id,
		name: integration.name,
		purpose: integration.purpose,
		state: integration.state === 'ACTIVE' ? 'active' : 'archived',
		createdByUserId: integration.createdByUserId,
		updatedByUserId: integration.updatedByUserId,
		archivedByUserId: integration.archivedByUserId,
		archivedAt: integration.archivedAt?.toISOString() ?? null,
		createdAt: integration.createdAt.toISOString(),
		updatedAt: integration.updatedAt.toISOString(),
		creator: {
			userId: integration.createdByUserId,
			discordUsername: integration.creatorDiscordUsername,
			discordNickname: integration.creatorDiscordNickname
		},
		credentialCount: integration.credentialCount
	};
}

function toCredentialDto(credential: ApiCredentialWithIntegrationRecord, timestamp: Date): ApiCredentialMetadata {
	return {
		id: credential.id,
		integrationId: credential.integrationId,
		label: credential.label,
		prefix: credential.prefix,
		scopes: credential.scopes,
		status: resolveCredentialStatus(credential, timestamp),
		createdByUserId: credential.createdByUserId,
		expiresAt: credential.expiresAt.toISOString(),
		revokedByUserId: credential.revokedByUserId,
		revokedAt: credential.revokedAt?.toISOString() ?? null,
		lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
		createdAt: credential.createdAt.toISOString(),
		updatedAt: credential.updatedAt.toISOString()
	};
}

function resolveCredentialStatus(credential: ApiCredentialWithIntegrationRecord, timestamp: Date): ApiCredentialStatus {
	if (credential.integration.state === 'ARCHIVED') return 'integration_archived';
	if (credential.revokedAt) return 'revoked';
	if (credential.expiresAt <= timestamp) return 'expired';
	return 'active';
}

function success<T>(value: T): ApiCredentialServiceResult<T> {
	return { ok: true, value };
}

function failure<T>(code: ApiCredentialServiceErrorCode): ApiCredentialServiceResult<T> {
	return { ok: false, error: { code } };
}
