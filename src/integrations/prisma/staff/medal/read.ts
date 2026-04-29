import { EventReviewDecisionKind, EventSessionState, Prisma } from '@prisma/client';

import { prisma } from '../../prisma';

const MEDAL_EVENT_STATES = [
	EventSessionState.ACTIVE,
	EventSessionState.ENDED_PENDING_REVIEW,
	EventSessionState.FINALIZED_WITH_MERITS,
	EventSessionState.FINALIZED_NO_MERITS
] as const;

const MEDAL_STANDALONE_DIVISION_CODES = ['INT', 'LGN', 'RES'] as const;

type RecentMedalEventsParams = {
	query?: string;
	since: Date;
	limit?: number;
};

export type RecentMedalEvent = Awaited<ReturnType<typeof findRecentMedalEventById>>;
export type ResolvedRecentMedalEvent = NonNullable<Awaited<ReturnType<typeof findRecentMedalEventById>>>;

export async function findRecentMedalEvents({ query = '', since, limit = 25 }: RecentMedalEventsParams) {
	const normalizedQuery = query.trim();

	return prisma.event.findMany({
		where: {
			state: {
				in: [...MEDAL_EVENT_STATES]
			},
			createdAt: {
				gte: since
			},
			...(normalizedQuery.length > 0
				? {
						OR: [
							{
								name: {
									contains: normalizedQuery,
									mode: Prisma.QueryMode.insensitive
								}
							},
							{
								eventTier: {
									name: {
										contains: normalizedQuery,
										mode: Prisma.QueryMode.insensitive
									}
								}
							}
						]
					}
				: {})
		},
		select: {
			id: true,
			name: true,
			createdAt: true,
			state: true,
			eventTier: {
				select: {
					name: true
				}
			}
		},
		orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
		take: Math.max(1, limit)
	});
}

export async function findRecentMedalEventById({ eventSessionId, since }: { eventSessionId: number; since: Date }) {
	return prisma.event.findFirst({
		where: {
			id: eventSessionId,
			state: {
				in: [...MEDAL_EVENT_STATES]
			},
			createdAt: {
				gte: since
			}
		},
		select: {
			id: true,
			name: true,
			createdAt: true,
			state: true,
			channels: {
				select: {
					channelId: true,
					kind: true
				}
			},
			eventTier: {
				select: {
					name: true
				}
			}
		}
	});
}

export async function findEventAttendeeUsers({ eventSessionId, query = '', limit = 25 }: { eventSessionId: number; query?: string; limit?: number }) {
	const normalizedQuery = query.trim();

	return prisma.eventParticipantStat.findMany({
		where: {
			eventSessionId,
			...(normalizedQuery.length > 0
				? {
						user: {
							OR: [
								{
									discordNickname: {
										contains: normalizedQuery,
										mode: Prisma.QueryMode.insensitive
									}
								},
								{
									discordUsername: {
										contains: normalizedQuery,
										mode: Prisma.QueryMode.insensitive
									}
								},
								{
									discordUserId: {
										contains: normalizedQuery
									}
								}
							]
						}
					}
				: {})
		},
		select: {
			userId: true,
			attendedSeconds: true,
			user: {
				select: {
					id: true,
					discordUserId: true,
					discordUsername: true,
					discordNickname: true,
					divisionMemberships: {
						select: {
							division: true
						}
					}
				}
			}
		},
		orderBy: [{ attendedSeconds: 'desc' }, { userId: 'asc' }],
		take: Math.max(1, limit)
	});
}

export async function findEventAttendeeUserByDiscordUserId({ eventSessionId, discordUserId }: { eventSessionId: number; discordUserId: string }) {
	return prisma.eventParticipantStat.findFirst({
		where: {
			eventSessionId,
			user: {
				discordUserId
			}
		},
		select: {
			userId: true,
			attendedSeconds: true,
			user: {
				select: {
					id: true,
					discordUserId: true,
					discordUsername: true,
					discordNickname: true,
					divisionMemberships: {
						select: {
							division: true
						}
					}
				}
			}
		}
	});
}

export async function findEventMeritRecipientUsers({ eventSessionId }: { eventSessionId: number }) {
	return prisma.eventReviewDecision
		.findMany({
			where: {
				eventSessionId,
				decision: EventReviewDecisionKind.MERIT
			},
			select: {
				targetUserId: true,
				targetUser: {
					select: {
						id: true,
						discordUserId: true,
						discordUsername: true,
						discordNickname: true,
						divisionMemberships: {
							select: {
								division: true
							}
						}
					}
				}
			},
			orderBy: [{ targetUserId: 'asc' }]
		})
		.then((rows) =>
			rows.map((row) => ({
				userId: row.targetUserId,
				user: row.targetUser
			}))
		);
}

export async function findStandaloneMedalEligibleUsers({ query = '', limit = 25 }: { query?: string; limit?: number }) {
	const normalizedQuery = query.trim();

	return prisma.user.findMany({
		where: {
			divisionMemberships: {
				some: {
					division: {
						code: {
							in: [...MEDAL_STANDALONE_DIVISION_CODES]
						}
					}
				}
			},
			...(normalizedQuery.length > 0
				? {
						OR: [
							{
								discordNickname: {
									contains: normalizedQuery,
									mode: Prisma.QueryMode.insensitive
								}
							},
							{
								discordUsername: {
									contains: normalizedQuery,
									mode: Prisma.QueryMode.insensitive
								}
							},
							{
								discordUserId: {
									contains: normalizedQuery
								}
							}
						]
					}
				: {})
		},
		select: {
			id: true,
			discordUserId: true,
			discordUsername: true,
			discordNickname: true,
			divisionMemberships: {
				select: {
					division: true
				}
			}
		},
		orderBy: [{ discordNickname: 'asc' }, { discordUsername: 'asc' }, { id: 'asc' }],
		take: Math.max(1, limit)
	});
}

export async function findStandaloneMedalEligibleUserByDiscordUserId({ discordUserId }: { discordUserId: string }) {
	return prisma.user.findFirst({
		where: {
			discordUserId,
			divisionMemberships: {
				some: {
					division: {
						code: {
							in: [...MEDAL_STANDALONE_DIVISION_CODES]
						}
					}
				}
			}
		},
		select: {
			id: true,
			discordUserId: true,
			discordUsername: true,
			discordNickname: true,
			divisionMemberships: {
				select: {
					division: true
				}
			}
		}
	});
}
