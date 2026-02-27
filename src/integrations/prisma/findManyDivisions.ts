import type { DivisionKind, Prisma } from '@prisma/client';

import { prisma } from './prisma';
import { container } from '@sapphire/framework';

type FindManyDivisionsParams = {
  ids?: number[];
  codes?: string[];
  kinds?: DivisionKind[];
  requireEmoji?: boolean;
};

export async function findManyDivisions({
  ids,
  codes,
  kinds,
  requireEmoji = false,
}: FindManyDivisionsParams = {}) {
  const caller = 'findManyDivisions';

  const and: Prisma.DivisionWhereInput[] = [];

  if (ids && ids.length > 0) {
    and.push({ id: { in: ids } });
  }

  if (codes && codes.length > 0) {
    and.push({ code: { in: codes } });
  }

  const kindFilters = [
    ...(kinds ?? []).filter(Boolean),
  ];
  if (kindFilters.length === 1) {
    and.push({ kind: kindFilters[0] });
  } else if (kindFilters.length > 1) {
    and.push({ kind: { in: [...new Set(kindFilters)] } });
  }
  if (requireEmoji) {
    and.push({ emojiId: { not: null } }, { emojiName: { not: null } });
  }

  container.logger.trace({ caller, and }, 'findManyDivisions parameters');

  return prisma.division.findMany({
    where: and.length > 0 ? { AND: and } : undefined,
    orderBy: { id: 'asc' },
  });
}
