import { readFile } from 'node:fs/promises';

import { PrismaPg } from '@prisma/adapter-pg';
import { EventSessionState, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { redactConnectionString, requiredEnv } from './env';

type DumpParticipant = {
	userId: string;
	totalSecondsPresent: number;
};

type DumpEventSession = {
	id: number;
	rootSessionId: number | null;
	startedBy: string;
	startedAt: string;
	endedAt: string | null;
	status: string;
	meritTypeId: number | null;
	awardDescription: string | null;
	participants: DumpParticipant[];
};

type DumpFile = {
	sessions: DumpEventSession[];
};

type CollapsedEvent = {
	eventId: number;
	sessions: DumpEventSession[];
	root: DumpEventSession;
};

const TARGET_DATABASE_URL = requiredEnv(['MIGRATION_TARGET_DATABASE_URL', 'DATABASE_URL']);
const INPUT_PATH = 'data/old-event-sessions.json';
const UNKNOWN_THREAD_ID_PREFIX = 'unknown';
const ARBITER_SYSTEM_DISCORD_USER_ID = '1376748367731884063';
const ARBITER_SYSTEM_USERNAME = 'arbiter-system';
const ARBITER_SYSTEM_NICKNAME = 'Arbiter';
const ARBITER_SYSTEM_AVATAR_URL = 'https://cdn.discordapp.com/embed/avatars/0.png';

const DRY_RUN = false;
const FAIL_FAST = true;
const LIMIT: number | undefined = undefined;
const ONLY_EVENT_IDS = new Set<number>([]);

const OLD_MERIT_TYPE_TO_NEW_EVENT_TIER_CODE: Record<number, string> = {
	10: 'TIER_0',
	1: 'TIER_3',
	2: 'TIER_2',
	3: 'TIER_1',
	9: 'TRAINING'
};
const IGNORED_OLD_MERIT_TYPE_IDS = new Set<number>([7]);

function parseDump(input: string): DumpFile {
	const parsed = JSON.parse(input) as Partial<DumpFile>;
	if (!parsed.sessions || !Array.isArray(parsed.sessions)) {
		throw new Error(`Invalid dump file: expected "sessions" array at ${INPUT_PATH}`);
	}
	return {
		sessions: parsed.sessions
	};
}

function collapseByRoot(sessions: DumpEventSession[]): CollapsedEvent[] {
	const byRoot = new Map<number, DumpEventSession[]>();

	for (const session of sessions) {
		const rootId = session.rootSessionId ?? session.id;
		const current = byRoot.get(rootId) ?? [];
		current.push(session);
		byRoot.set(rootId, current);
	}

	const collapsed: CollapsedEvent[] = [];
	for (const [eventId, group] of byRoot.entries()) {
		const root = group.find((session) => session.id === eventId) ?? group.find((session) => session.rootSessionId === null) ?? group[0];
		if (!root) {
			continue;
		}

		collapsed.push({
			eventId,
			sessions: group,
			root
		});
	}

	collapsed.sort((a, b) => a.eventId - b.eventId);
	return collapsed;
}

function resolveOldMeritTypeId(group: CollapsedEvent): number | null {
	if (group.root.meritTypeId !== null) {
		return group.root.meritTypeId;
	}

	for (const session of group.sessions) {
		if (session.meritTypeId !== null) {
			return session.meritTypeId;
		}
	}

	return null;
}

function aggregateParticipants(group: CollapsedEvent): Map<string, number> {
	const totals = new Map<string, number>();

	for (const session of group.sessions) {
		for (const participant of session.participants ?? []) {
			const prev = totals.get(participant.userId) ?? 0;
			const increment = Number.isFinite(participant.totalSecondsPresent) ? participant.totalSecondsPresent : 0;
			totals.set(participant.userId, prev + Math.max(0, Math.trunc(increment)));
		}
	}

	return totals;
}

async function main() {
	console.log(`Input path: ${INPUT_PATH}`);
	console.log(`Target DB: ${redactConnectionString(TARGET_DATABASE_URL)}`);
	console.log(`Dry run: ${DRY_RUN ? 'yes' : 'no'}`);

	const raw = await readFile(INPUT_PATH, 'utf8');
	const dump = parseDump(raw);
	let events = collapseByRoot(dump.sessions);

	if (ONLY_EVENT_IDS.size > 0) {
		events = events.filter((event) => ONLY_EVENT_IDS.has(event.eventId));
	}
	if (typeof LIMIT === 'number') {
		events = events.slice(0, LIMIT);
	}

	const discordIds = new Set<string>();
	for (const event of events) {
		discordIds.add(event.root.startedBy);
		for (const session of event.sessions) {
			for (const participant of session.participants ?? []) {
				discordIds.add(participant.userId);
			}
		}
	}

	const targetPool = new Pool({ connectionString: TARGET_DATABASE_URL });
	const prisma = new PrismaClient({
		adapter: new PrismaPg(targetPool)
	});

	try {
		const users = await prisma.user.findMany({
			where: { discordUserId: { in: [...discordIds] } },
			select: { id: true, discordUserId: true }
		});
		const userIdByDiscordId = new Map(users.map((user) => [user.discordUserId, user.id]));

		const systemUser = await prisma.user.upsert({
			where: { discordUserId: ARBITER_SYSTEM_DISCORD_USER_ID },
			update: {
				discordUsername: ARBITER_SYSTEM_USERNAME,
				discordNickname: ARBITER_SYSTEM_NICKNAME,
				discordAvatarUrl: ARBITER_SYSTEM_AVATAR_URL
			},
			create: {
				discordUserId: ARBITER_SYSTEM_DISCORD_USER_ID,
				discordUsername: ARBITER_SYSTEM_USERNAME,
				discordNickname: ARBITER_SYSTEM_NICKNAME,
				discordAvatarUrl: ARBITER_SYSTEM_AVATAR_URL
			},
			select: { id: true, discordUserId: true }
		});
		userIdByDiscordId.set(systemUser.discordUserId, systemUser.id);

		const requiredTierCodes = [...new Set(Object.values(OLD_MERIT_TYPE_TO_NEW_EVENT_TIER_CODE))];
		const eventTiers = await prisma.eventTier.findMany({
			where: { code: { in: requiredTierCodes } },
			select: { id: true, code: true }
		});
		const eventTierIdByCode = new Map(eventTiers.map((tier) => [tier.code, tier.id]));

		const stats = {
			totalLegacySessions: dump.sessions.length,
			totalCollapsedEvents: events.length,
			created: 0,
			updated: 0,
			wouldCreate: 0,
			wouldUpdate: 0,
			skippedIgnoredMeritType: 0,
			skippedNoMeritType: 0,
			skippedUnmappedMeritType: 0,
			skippedMissingEventTier: 0,
			hostsReplacedWithSystemUser: 0,
			participantsSeeded: 0,
			participantsSkippedMissingUser: 0,
			failed: 0
		};

		for (const event of events) {
			try {
				const oldMeritTypeId = resolveOldMeritTypeId(event);
				if (oldMeritTypeId === null) {
					stats.skippedNoMeritType += 1;
					console.warn(`Skipping event ${event.eventId}: no meritTypeId found in root/children`);
					continue;
				}
				if (IGNORED_OLD_MERIT_TYPE_IDS.has(oldMeritTypeId)) {
					stats.skippedIgnoredMeritType += 1;
					console.warn(`Skipping event ${event.eventId}: meritTypeId ${oldMeritTypeId} is ignored`);
					continue;
				}

				const tierCode = OLD_MERIT_TYPE_TO_NEW_EVENT_TIER_CODE[oldMeritTypeId];
				if (!tierCode) {
					stats.skippedUnmappedMeritType += 1;
					console.warn(`Skipping event ${event.eventId}: no mapping for old meritTypeId ${oldMeritTypeId}`);
					continue;
				}

				const eventTierId = eventTierIdByCode.get(tierCode);
				if (!eventTierId) {
					stats.skippedMissingEventTier += 1;
					console.warn(`Skipping event ${event.eventId}: missing EventTier with code ${tierCode}`);
					continue;
				}

				let hostUserId = userIdByDiscordId.get(event.root.startedBy);
				if (!hostUserId) {
					hostUserId = systemUser.id;
					stats.hostsReplacedWithSystemUser += 1;
				}

				const startedAt = new Date(event.root.startedAt);
				const endedAt = event.root.endedAt ? new Date(event.root.endedAt) : null;
				const name = event.root.awardDescription?.trim() || 'Unnamed Event';
				const threadId = `${UNKNOWN_THREAD_ID_PREFIX}-${event.eventId}`;

				const participantTotals = aggregateParticipants(event);
				const participantRows: { userId: string; attendedSeconds: number }[] = [];
				for (const [discordUserId, attendedSeconds] of participantTotals.entries()) {
					const mappedUserId = userIdByDiscordId.get(discordUserId);
					if (!mappedUserId) {
						stats.participantsSkippedMissingUser += 1;
						continue;
					}
					participantRows.push({
						userId: mappedUserId,
						attendedSeconds
					});
				}

				const existing = await prisma.event.findUnique({
					where: { id: event.eventId },
					select: { id: true }
				});

				if (DRY_RUN) {
					if (existing) {
						stats.wouldUpdate += 1;
					} else {
						stats.wouldCreate += 1;
					}
					stats.participantsSeeded += participantRows.length;
					continue;
				}

				await prisma.$transaction(async (tx) => {
					await tx.event.upsert({
						where: { id: event.eventId },
						update: {
							hostUserId,
							eventTierId,
							threadId,
							name,
							state: EventSessionState.FINALIZED_WITH_MERITS,
							startedAt,
							endedAt,
							createdAt: startedAt,
							reviewFinalizedAt: endedAt ?? startedAt,
							reviewFinalizedByUserId: hostUserId
						},
						create: {
							id: event.eventId,
							hostUserId,
							eventTierId,
							threadId,
							name,
							state: EventSessionState.FINALIZED_WITH_MERITS,
							startedAt,
							endedAt,
							createdAt: startedAt,
							reviewFinalizedAt: endedAt ?? startedAt,
							reviewFinalizedByUserId: hostUserId
						}
					});

					await tx.eventParticipantStat.deleteMany({
						where: { eventSessionId: event.eventId }
					});

					if (participantRows.length > 0) {
						await tx.eventParticipantStat.createMany({
							data: participantRows.map((row) => ({
								eventSessionId: event.eventId,
								userId: row.userId,
								attendedSeconds: row.attendedSeconds,
								createdAt: startedAt
							}))
						});
					}
				});

				if (existing) {
					stats.updated += 1;
				} else {
					stats.created += 1;
				}
				stats.participantsSeeded += participantRows.length;
			} catch (error) {
				stats.failed += 1;
				console.error(`Failed seeding event ${event.eventId}`, error);
				if (FAIL_FAST) {
					throw error;
				}
			}
		}

		console.log('Event seeding finished');
		console.table(stats);
	} finally {
		await prisma.$disconnect();
		await targetPool.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
