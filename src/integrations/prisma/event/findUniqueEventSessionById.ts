import { prisma } from '../prisma';

type FindUniqueEventSessionByIdParams = {
	eventSessionId: number;
};

export async function findUniqueEventSessionById({ eventSessionId }: FindUniqueEventSessionByIdParams) {
	return prisma.eventSession.findUnique({
		where: {
			id: eventSessionId
		},
		include: {
			hostUser: true,
			eventTier: true,
			channels: true,
			eventMessages: true
		}
	});
}
