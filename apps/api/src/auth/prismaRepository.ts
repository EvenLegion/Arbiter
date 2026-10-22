import { DivisionKind, type PrismaClient } from '@prisma/client';

import type { AuthRepository } from './types';

export function createPrismaAuthRepository(prisma: PrismaClient): AuthRepository {
	return {
		findStaffIdentityByDiscordUserId: async (discordUserId) => {
			const user = await prisma.user.findUnique({
				where: { discordUserId },
				select: {
					id: true,
					discordUserId: true,
					discordUsername: true,
					discordNickname: true,
					discordAvatarUrl: true,
					divisionMemberships: { select: { division: { select: { code: true, kind: true } } } }
				}
			});
			if (!user) return null;
			const divisions = user.divisionMemberships.map(({ division }) => division);
			if (!divisions.some(({ kind }) => kind === DivisionKind.STAFF)) return null;
			return {
				userId: user.id,
				discordUserId: user.discordUserId,
				discordUsername: user.discordUsername,
				discordNickname: user.discordNickname,
				discordAvatarUrl: user.discordAvatarUrl,
				role: divisions.some(({ code }) => code === 'EXEC') ? 'EXEC' : 'STAFF'
			};
		}
	};
}
