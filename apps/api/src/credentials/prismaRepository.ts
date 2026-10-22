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
type PrismaApiCredentialWithIntegration = Prisma.ApiCredentialGetPayload<{
	include: { integration: true; createdByUser: { select: { discordUsername: true; discordNickname: true } } };
}>;

const registryInclude = {
	createdByUser: { select: { discordUsername: true, discordNickname: true } },
	_count: { select: { credentials: true } }
} as const;

const credentialInclude = {
	integration: true,
	createdByUser: { select: { discordUsername: true, discordNickname: true } }
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
		mintCredential: async (input, signal) => {
			try {
				return await prisma.$transaction(async (tx) => {
					signal?.throwIfAborted();
					await lockIntegration(tx, input.integrationId);
					signal?.throwIfAborted();
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
						include: credentialInclude
					});
					signal?.throwIfAborted();
					return { status: 'created', credential: mapCredentialWithIntegration(credential) } as const;
				});
			} catch (error) {
				if (isUniqueConstraintError(error)) return { status: 'prefix_conflict' } as const;
				throw error;
			}
		},
		findCredentialById: async (id, signal) => {
			signal?.throwIfAborted();
			const credential = await prisma.apiCredential.findUnique({ where: { id }, include: credentialInclude });
			signal?.throwIfAborted();
			return credential ? mapCredentialWithIntegration(credential) : null;
		},
		findCredentialByPrefix: async (prefix, signal, deadlineAtMs) => {
			const credential = await withRequestDeadline(prisma, signal, deadlineAtMs, (tx) =>
				tx.apiCredential.findUnique({ where: { prefix }, include: credentialInclude })
			);
			return credential ? mapCredentialWithIntegration(credential) : null;
		},
		listCredentials: async (integrationId, signal) => {
			signal?.throwIfAborted();
			const credentials = await prisma.apiCredential.findMany({
				where: { integrationId },
				include: credentialInclude,
				orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
			});
			signal?.throwIfAborted();
			return credentials.map(mapCredentialWithIntegration);
		},
		revokeCredential: async (id, actorUserId, revokedAt, signal) => {
			signal?.throwIfAborted();
			const result = await prisma.apiCredential.updateMany({
				where: { id, revokedAt: null },
				data: { revokedAt, revokedByUserId: actorUserId }
			});
			signal?.throwIfAborted();
			const credential = await prisma.apiCredential.findUnique({ where: { id }, include: credentialInclude });
			signal?.throwIfAborted();
			if (!credential) return { status: 'not_found' };
			return {
				status: result.count === 1 ? 'revoked' : 'already_revoked',
				credential: mapCredentialWithIntegration(credential)
			};
		},
		touchLastUsed: async (id, usedAt, staleBefore, signal, deadlineAtMs) => {
			const result = await withRequestDeadline(prisma, signal, deadlineAtMs, (tx) =>
				tx.apiCredential.updateMany({
					where: { id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: staleBefore } }] },
					data: { lastUsedAt: usedAt }
				})
			);
			return result.count === 1;
		}
	};
}

async function withRequestDeadline<T>(
	prisma: PrismaClient,
	signal: AbortSignal | undefined,
	deadlineAtMs: number | undefined,
	operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
	signal?.throwIfAborted();
	const remainingMs = deadlineAtMs === undefined ? undefined : Math.floor(deadlineAtMs - Date.now());
	if (remainingMs !== undefined && remainingMs <= 0) throw new Error('API credential request deadline exceeded');
	const execute = async (tx: Prisma.TransactionClient) => {
		signal?.throwIfAborted();
		if (deadlineAtMs !== undefined) {
			const statementRemainingMs = Math.floor(deadlineAtMs - Date.now());
			if (statementRemainingMs <= 0) throw new Error('API credential request deadline exceeded');
			await tx.$queryRaw`SELECT set_config('statement_timeout', ${`${statementRemainingMs}ms`}, true)`;
		}
		const result = await operation(tx);
		signal?.throwIfAborted();
		return result;
	};
	if (remainingMs === undefined) return prisma.$transaction(execute);
	return prisma.$transaction(execute, { maxWait: remainingMs, timeout: remainingMs });
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
		integration: mapIntegration(credential.integration),
		creatorDiscordUsername: credential.createdByUser.discordUsername,
		creatorDiscordNickname: credential.createdByUser.discordNickname
	};
}

function isUniqueConstraintError(error: unknown): boolean {
	return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
