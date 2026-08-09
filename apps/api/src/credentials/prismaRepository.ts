import { ApiIntegrationState, Prisma, type PrismaClient } from '@prisma/client';
import { ApiScopeSchema } from '@arbiter/api-contracts';

import type {
	ApiCredentialRecord,
	ApiCredentialRepository,
	ApiCredentialWithIntegrationRecord,
	ApiIntegrationRecord,
	ApiIntegrationRegistryRecord
} from './types';

type PrismaApiIntegration = Awaited<ReturnType<PrismaClient['apiIntegration']['findUniqueOrThrow']>>;
type PrismaApiIntegrationRegistry = Prisma.ApiIntegrationGetPayload<{
	include: {
		createdByUser: { select: { discordUsername: true; discordNickname: true } };
		_count: { select: { credentials: true } };
	};
}>;
type PrismaApiCredentialWithIntegration = Prisma.ApiCredentialGetPayload<{ include: { integration: true } }>;

const registryInclude = {
	createdByUser: { select: { discordUsername: true, discordNickname: true } },
	_count: { select: { credentials: true } }
} as const;

export function createPrismaApiCredentialRepository(prisma: PrismaClient): ApiCredentialRepository {
	return {
		createIntegration: async (input, signal) => {
			try {
				return await prisma.$transaction(async (tx) => {
					signal?.throwIfAborted();
					const integration = await tx.apiIntegration.create({
						data: {
							name: input.name,
							nameKey: input.nameKey,
							purpose: input.purpose,
							createdByUserId: input.actorUserId,
							updatedByUserId: input.actorUserId
						},
						include: registryInclude
					});
					signal?.throwIfAborted();
					return { status: 'created', integration: mapRegistryIntegration(integration) } as const;
				});
			} catch (error) {
				if (isUniqueConstraintError(error)) return { status: 'conflict' };
				throw error;
			}
		},
		findIntegrationById: async (id) => {
			const integration = await prisma.apiIntegration.findUnique({ where: { id } });
			return integration ? mapIntegration(integration) : null;
		},
		listIntegrations: async (includeArchived) => {
			const integrations = await prisma.apiIntegration.findMany({
				where: includeArchived ? undefined : { state: ApiIntegrationState.ACTIVE },
				orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
				include: registryInclude
			});
			return integrations.map(mapRegistryIntegration);
		},
		updateIntegration: async (input, signal) => {
			try {
				return await prisma.$transaction(async (tx) => {
					signal?.throwIfAborted();
					await lockIntegration(tx, input.id);
					signal?.throwIfAborted();
					const existing = await tx.apiIntegration.findUnique({ where: { id: input.id }, select: { state: true, updatedAt: true } });
					if (!existing) return { status: 'not_found' } as const;
					if (existing.state !== ApiIntegrationState.ACTIVE) return { status: 'inactive' } as const;
					if (existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) return { status: 'stale' } as const;
					const integration = await tx.apiIntegration.update({
						where: { id: input.id },
						data: {
							name: input.name,
							nameKey: input.nameKey,
							purpose: input.purpose,
							updatedByUserId: input.actorUserId
						},
						include: registryInclude
					});
					signal?.throwIfAborted();
					return { status: 'updated', integration: mapRegistryIntegration(integration) } as const;
				});
			} catch (error) {
				if (isUniqueConstraintError(error)) return { status: 'conflict' };
				throw error;
			}
		},
		archiveIntegration: ({ id, actorUserId, archivedAt, expectedUpdatedAt }, signal) =>
			prisma.$transaction(async (tx) => {
				signal?.throwIfAborted();
				await lockIntegration(tx, id);
				signal?.throwIfAborted();
				const existing = await tx.apiIntegration.findUnique({ where: { id }, include: registryInclude });
				if (!existing) return { status: 'not_found' } as const;
				if (existing.state === ApiIntegrationState.ARCHIVED) {
					return { status: 'already_archived', integration: mapRegistryIntegration(existing) } as const;
				}
				if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) return { status: 'stale' } as const;
				const integration = await tx.apiIntegration.update({
					where: { id },
					data: {
						state: ApiIntegrationState.ARCHIVED,
						archivedAt,
						archivedByUserId: actorUserId,
						updatedByUserId: actorUserId
					},
					include: registryInclude
				});
				signal?.throwIfAborted();
				return { status: 'archived', integration: mapRegistryIntegration(integration) } as const;
			}),
		mintCredential: async (input) => {
			try {
				return await prisma.$transaction(async (tx) => {
					await lockIntegration(tx, input.integrationId);
					const integration = await tx.apiIntegration.findUnique({ where: { id: input.integrationId } });
					if (!integration) return { status: 'integration_not_found' } as const;
					if (integration.state !== ApiIntegrationState.ACTIVE) return { status: 'integration_archived' } as const;
					const credential = await tx.apiCredential.create({
						data: {
							integrationId: input.integrationId,
							label: input.label,
							prefix: input.prefix,
							verifier: input.verifier,
							scopes: input.scopes,
							expiresAt: input.expiresAt,
							createdByUserId: input.actorUserId
						},
						include: { integration: true }
					});
					return { status: 'created', credential: mapCredentialWithIntegration(credential) } as const;
				});
			} catch (error) {
				if (isUniqueConstraintError(error)) return { status: 'prefix_conflict' } as const;
				throw error;
			}
		},
		findCredentialById: async (id) => {
			const credential = await prisma.apiCredential.findUnique({ where: { id }, include: { integration: true } });
			return credential ? mapCredentialWithIntegration(credential) : null;
		},
		findCredentialByPrefix: async (prefix) => {
			const credential = await prisma.apiCredential.findUnique({ where: { prefix }, include: { integration: true } });
			return credential ? mapCredentialWithIntegration(credential) : null;
		},
		listCredentials: async (integrationId) => {
			const credentials = await prisma.apiCredential.findMany({
				where: { integrationId },
				include: { integration: true },
				orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
			});
			return credentials.map(mapCredentialWithIntegration);
		},
		revokeCredential: async (id, actorUserId, revokedAt) => {
			const result = await prisma.apiCredential.updateMany({
				where: { id, revokedAt: null },
				data: { revokedAt, revokedByUserId: actorUserId }
			});
			const credential = await prisma.apiCredential.findUnique({ where: { id }, include: { integration: true } });
			if (!credential) return { status: 'not_found' };
			return {
				status: result.count === 1 ? 'revoked' : 'already_revoked',
				credential: mapCredentialWithIntegration(credential)
			};
		},
		touchLastUsed: async (id, usedAt, staleBefore) => {
			const result = await prisma.apiCredential.updateMany({
				where: { id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: staleBefore } }] },
				data: { lastUsedAt: usedAt }
			});
			return result.count === 1;
		}
	};
}

async function lockIntegration(tx: Prisma.TransactionClient, id: string): Promise<void> {
	await tx.$queryRaw`SELECT "id" FROM "ApiIntegration" WHERE "id" = ${id} FOR UPDATE`;
}

function mapIntegration(integration: PrismaApiIntegration): ApiIntegrationRecord {
	return {
		id: integration.id,
		name: integration.name,
		nameKey: integration.nameKey,
		purpose: integration.purpose,
		state: integration.state,
		createdByUserId: integration.createdByUserId,
		updatedByUserId: integration.updatedByUserId,
		archivedByUserId: integration.archivedByUserId,
		archivedAt: integration.archivedAt,
		createdAt: integration.createdAt,
		updatedAt: integration.updatedAt
	};
}

function mapRegistryIntegration(integration: PrismaApiIntegrationRegistry): ApiIntegrationRegistryRecord {
	return {
		...mapIntegration(integration),
		creatorDiscordUsername: integration.createdByUser.discordUsername,
		creatorDiscordNickname: integration.createdByUser.discordNickname,
		credentialCount: integration._count.credentials
	};
}

function mapCredential(credential: Omit<PrismaApiCredentialWithIntegration, 'integration'>): ApiCredentialRecord {
	return {
		id: credential.id,
		integrationId: credential.integrationId,
		label: credential.label,
		prefix: credential.prefix,
		verifier: credential.verifier,
		scopes: credential.scopes.map((scope) => ApiScopeSchema.parse(scope)),
		expiresAt: credential.expiresAt,
		createdByUserId: credential.createdByUserId,
		revokedByUserId: credential.revokedByUserId,
		revokedAt: credential.revokedAt,
		lastUsedAt: credential.lastUsedAt,
		createdAt: credential.createdAt,
		updatedAt: credential.updatedAt
	};
}

function mapCredentialWithIntegration(credential: PrismaApiCredentialWithIntegration): ApiCredentialWithIntegrationRecord {
	return {
		...mapCredential(credential),
		integration: mapIntegration(credential.integration)
	};
}

function isUniqueConstraintError(error: unknown): boolean {
	return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
