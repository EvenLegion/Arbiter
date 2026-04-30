import { EventReviewDecisionKind } from '@prisma/client';

import { prisma } from '../prisma';

export type UserReferenceCounts = {
	divisionMemberships: number;
	nameChangeRequestsRequested: number;
	nameChangeRequestsReviewed: number;
	meritsReceived: number;
	meritsAwarded: number;
	hostedEvents: number;
	finalizedEvents: number;
	eventChannelsAdded: number;
	participantStats: number;
	reviewDecisions: number;
};

export type MigrationCounts = {
	requestedNameChangesMigrated: number;
	reviewedNameChangesMigrated: number;
	meritsReceivedMigrated: number;
	meritsAwardedMigrated: number;
	hostedEventsMigrated: number;
	finalizedEventsMigrated: number;
	eventChannelsMigrated: number;
	divisionMembershipsReassigned: number;
	divisionMembershipsMerged: number;
	participantStatsReassigned: number;
	participantStatsMerged: number;
	reviewDecisionsReassigned: number;
	reviewDecisionsMerged: number;
	baseNicknameCopied: boolean;
};

export async function migrateUsersByDiscordUserId({ oldDiscordUserId, newDiscordUserId }: { oldDiscordUserId: string; newDiscordUserId: string }) {
	if (oldDiscordUserId === newDiscordUserId) {
		return {
			kind: 'same_user' as const
		};
	}

	return prisma.$transaction(async (tx) => {
		const [oldUser, newUser] = await Promise.all([
			tx.user.findUnique({
				where: {
					discordUserId: oldDiscordUserId
				}
			}),
			tx.user.findUnique({
				where: {
					discordUserId: newDiscordUserId
				}
			})
		]);

		if (!oldUser) {
			return {
				kind: 'old_user_not_found' as const
			};
		}

		if (!newUser) {
			return {
				kind: 'new_user_not_found' as const
			};
		}

		const counts: MigrationCounts = {
			requestedNameChangesMigrated: 0,
			reviewedNameChangesMigrated: 0,
			meritsReceivedMigrated: 0,
			meritsAwardedMigrated: 0,
			hostedEventsMigrated: 0,
			finalizedEventsMigrated: 0,
			eventChannelsMigrated: 0,
			divisionMembershipsReassigned: 0,
			divisionMembershipsMerged: 0,
			participantStatsReassigned: 0,
			participantStatsMerged: 0,
			reviewDecisionsReassigned: 0,
			reviewDecisionsMerged: 0,
			baseNicknameCopied: oldUser.discordNickname !== newUser.discordNickname
		};

		const [requestedNameChanges, reviewedNameChanges, meritsReceived, meritsAwarded, hostedEvents, finalizedEvents, eventChannels] =
			await Promise.all([
				tx.nameChangeRequest.updateMany({
					where: {
						requesterUserId: oldUser.id
					},
					data: {
						requesterUserId: newUser.id
					}
				}),
				tx.nameChangeRequest.updateMany({
					where: {
						reviewerUserId: oldUser.id
					},
					data: {
						reviewerUserId: newUser.id
					}
				}),
				tx.merit.updateMany({
					where: {
						userId: oldUser.id
					},
					data: {
						userId: newUser.id
					}
				}),
				tx.merit.updateMany({
					where: {
						awardedByUserId: oldUser.id
					},
					data: {
						awardedByUserId: newUser.id
					}
				}),
				tx.event.updateMany({
					where: {
						hostUserId: oldUser.id
					},
					data: {
						hostUserId: newUser.id
					}
				}),
				tx.event.updateMany({
					where: {
						reviewFinalizedByUserId: oldUser.id
					},
					data: {
						reviewFinalizedByUserId: newUser.id
					}
				}),
				tx.eventChannel.updateMany({
					where: {
						addedByUserId: oldUser.id
					},
					data: {
						addedByUserId: newUser.id
					}
				})
			]);

		counts.requestedNameChangesMigrated = requestedNameChanges.count;
		counts.reviewedNameChangesMigrated = reviewedNameChanges.count;
		counts.meritsReceivedMigrated = meritsReceived.count;
		counts.meritsAwardedMigrated = meritsAwarded.count;
		counts.hostedEventsMigrated = hostedEvents.count;
		counts.finalizedEventsMigrated = finalizedEvents.count;
		counts.eventChannelsMigrated = eventChannels.count;

		const oldMemberships = await tx.divisionMembership.findMany({
			where: {
				userId: oldUser.id
			},
			orderBy: {
				id: 'asc'
			}
		});
		const newMemberships = await tx.divisionMembership.findMany({
			where: {
				userId: newUser.id
			},
			select: {
				divisionId: true
			}
		});
		const newDivisionIds = new Set(newMemberships.map((membership) => membership.divisionId));

		for (const membership of oldMemberships) {
			if (newDivisionIds.has(membership.divisionId)) {
				await tx.divisionMembership.delete({
					where: {
						id: membership.id
					}
				});
				counts.divisionMembershipsMerged += 1;
				continue;
			}

			await tx.divisionMembership.update({
				where: {
					id: membership.id
				},
				data: {
					userId: newUser.id
				}
			});
			counts.divisionMembershipsReassigned += 1;
			newDivisionIds.add(membership.divisionId);
		}

		const oldParticipantStats = await tx.eventParticipantStat.findMany({
			where: {
				userId: oldUser.id
			},
			orderBy: {
				id: 'asc'
			}
		});
		const newParticipantStats =
			oldParticipantStats.length === 0
				? []
				: await tx.eventParticipantStat.findMany({
						where: {
							userId: newUser.id,
							eventSessionId: {
								in: [...new Set(oldParticipantStats.map((row) => row.eventSessionId))]
							}
						}
					});
		const newParticipantByEventId = new Map(newParticipantStats.map((row) => [row.eventSessionId, row]));

		for (const stat of oldParticipantStats) {
			const overlapping = newParticipantByEventId.get(stat.eventSessionId);
			if (!overlapping) {
				await tx.eventParticipantStat.update({
					where: {
						id: stat.id
					},
					data: {
						userId: newUser.id
					}
				});
				counts.participantStatsReassigned += 1;
				continue;
			}

			if (stat.attendedSeconds > overlapping.attendedSeconds) {
				await tx.eventParticipantStat.update({
					where: {
						id: overlapping.id
					},
					data: {
						attendedSeconds: stat.attendedSeconds
					}
				});
			}

			await tx.eventParticipantStat.delete({
				where: {
					id: stat.id
				}
			});
			counts.participantStatsMerged += 1;
		}

		const oldReviewDecisions = await tx.eventReviewDecision.findMany({
			where: {
				targetUserId: oldUser.id
			},
			orderBy: {
				id: 'asc'
			}
		});
		const newReviewDecisions =
			oldReviewDecisions.length === 0
				? []
				: await tx.eventReviewDecision.findMany({
						where: {
							targetUserId: newUser.id,
							eventSessionId: {
								in: [...new Set(oldReviewDecisions.map((row) => row.eventSessionId))]
							}
						}
					});
		const newDecisionByEventId = new Map(newReviewDecisions.map((row) => [row.eventSessionId, row]));

		for (const decision of oldReviewDecisions) {
			const overlapping = newDecisionByEventId.get(decision.eventSessionId);
			if (!overlapping) {
				await tx.eventReviewDecision.update({
					where: {
						id: decision.id
					},
					data: {
						targetUserId: newUser.id
					}
				});
				counts.reviewDecisionsReassigned += 1;
				continue;
			}

			const mergedDecision =
				decision.decision === EventReviewDecisionKind.MERIT || overlapping.decision === EventReviewDecisionKind.MERIT
					? EventReviewDecisionKind.MERIT
					: EventReviewDecisionKind.NO_MERIT;
			if (mergedDecision !== overlapping.decision) {
				await tx.eventReviewDecision.update({
					where: {
						id: overlapping.id
					},
					data: {
						decision: mergedDecision
					}
				});
			}

			await tx.eventReviewDecision.delete({
				where: {
					id: decision.id
				}
			});
			counts.reviewDecisionsMerged += 1;
		}

		if (counts.baseNicknameCopied) {
			await tx.user.update({
				where: {
					id: newUser.id
				},
				data: {
					discordNickname: oldUser.discordNickname
				}
			});
		}

		return {
			kind: 'migrated' as const,
			oldUser: {
				dbUserId: oldUser.id,
				discordUserId: oldUser.discordUserId
			},
			newUser: {
				dbUserId: newUser.id,
				discordUserId: newUser.discordUserId
			},
			counts
		};
	});
}

export async function purgeUserByDiscordUserId({ discordUserId }: { discordUserId: string }) {
	return prisma.$transaction(async (tx) => {
		const user = await tx.user.findUnique({
			where: {
				discordUserId
			}
		});
		if (!user) {
			return {
				kind: 'user_not_found' as const
			};
		}

		const referenceCounts = await getUserReferenceCounts(tx, user.id);
		const remainingReferences = Object.values(referenceCounts).reduce((sum, count) => sum + count, 0);
		if (remainingReferences > 0) {
			return {
				kind: 'references_remaining' as const,
				user: {
					dbUserId: user.id,
					discordUserId: user.discordUserId
				},
				referenceCounts
			};
		}

		await tx.user.delete({
			where: {
				id: user.id
			}
		});

		return {
			kind: 'purged' as const,
			user: {
				dbUserId: user.id,
				discordUserId: user.discordUserId
			}
		};
	});
}

async function getUserReferenceCounts(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], userId: string): Promise<UserReferenceCounts> {
	const [
		divisionMemberships,
		nameChangeRequestsRequested,
		nameChangeRequestsReviewed,
		meritsReceived,
		meritsAwarded,
		hostedEvents,
		finalizedEvents,
		eventChannelsAdded,
		participantStats,
		reviewDecisions
	] = await Promise.all([
		tx.divisionMembership.count({
			where: {
				userId
			}
		}),
		tx.nameChangeRequest.count({
			where: {
				requesterUserId: userId
			}
		}),
		tx.nameChangeRequest.count({
			where: {
				reviewerUserId: userId
			}
		}),
		tx.merit.count({
			where: {
				userId
			}
		}),
		tx.merit.count({
			where: {
				awardedByUserId: userId
			}
		}),
		tx.event.count({
			where: {
				hostUserId: userId
			}
		}),
		tx.event.count({
			where: {
				reviewFinalizedByUserId: userId
			}
		}),
		tx.eventChannel.count({
			where: {
				addedByUserId: userId
			}
		}),
		tx.eventParticipantStat.count({
			where: {
				userId
			}
		}),
		tx.eventReviewDecision.count({
			where: {
				targetUserId: userId
			}
		})
	]);

	return {
		divisionMemberships,
		nameChangeRequestsRequested,
		nameChangeRequestsReviewed,
		meritsReceived,
		meritsAwarded,
		hostedEvents,
		finalizedEvents,
		eventChannelsAdded,
		participantStats,
		reviewDecisions
	};
}

export const userMigrationRepository = {
	migrateByDiscordUserId: migrateUsersByDiscordUserId,
	purgeByDiscordUserId: purgeUserByDiscordUserId
};
