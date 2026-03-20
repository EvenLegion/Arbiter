import type { DivisionKind, Prisma } from '@prisma/client';

import { prisma } from '../prisma';

type FindManyDivisionsParams = {
	ids?: number[];
	codes?: string[];
	kinds?: DivisionKind[];
	requireEmoji?: boolean;
};

export type FindManyDivisionMembershipsParams = {
	userId?: string;
	discordUserId?: string;
};

type FindManyUsersDivisionsParams = {
	userId?: string;
	discordUserId?: string;
};

export async function findManyDivisions({ ids, codes, kinds, requireEmoji = false }: FindManyDivisionsParams = {}) {
	const and: Prisma.DivisionWhereInput[] = [];

	if (ids && ids.length > 0) {
		and.push({ id: { in: ids } });
	}

	if (codes && codes.length > 0) {
		and.push({ code: { in: codes } });
	}

	const kindFilters = [...(kinds ?? []).filter(Boolean)];
	if (kindFilters.length === 1) {
		and.push({ kind: kindFilters[0] });
	} else if (kindFilters.length > 1) {
		and.push({ kind: { in: [...new Set(kindFilters)] } });
	}
	if (requireEmoji) {
		and.push({ emojiId: { not: null } }, { emojiName: { not: null } });
	}

	return prisma.division.findMany({
		where: and.length > 0 ? { AND: and } : undefined,
		orderBy: { id: 'asc' }
	});
}

export async function findManyDivisionMemberships({ userId, discordUserId }: FindManyDivisionMembershipsParams) {
	if (!userId && !discordUserId) {
		throw new Error('Either userId or discordUserId must be provided');
	}

	const and: Prisma.DivisionMembershipWhereInput[] = [];

	if (userId) {
		and.push({ userId });
	}

	if (discordUserId) {
		and.push({ user: { discordUserId } });
	}

	return prisma.divisionMembership.findMany({
		where: and.length > 0 ? { AND: and } : undefined,
		orderBy: { id: 'asc' }
	});
}

export async function findManyUsersDivisions({ userId, discordUserId }: FindManyUsersDivisionsParams) {
	if (!userId && !discordUserId) {
		throw new Error('Either userId or discordUserId must be provided');
	}

	return prisma.division.findMany({
		where: {
			divisionMemberships: {
				some: {
					...(userId ? { userId } : {}),
					...(discordUserId ? { user: { discordUserId } } : {})
				}
			}
		},
		orderBy: { id: 'asc' }
	});
}
