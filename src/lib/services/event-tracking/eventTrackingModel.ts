import type { Prisma } from '@prisma/client';

export type ActiveTrackedEventSession = Prisma.EventGetPayload<{
	include: {
		channels: true;
	};
}>;
