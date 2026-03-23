import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import { EventSessionState, MeritTypeCode, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

import { redactConnectionString, requiredEnv } from './env';

type VerificationMismatch = {
	userId: string;
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
	hostedEventCount: number;
	hostMeritCount: number;
	linkedHostMeritCount: number;
	unlinkedHostMeritCount: number;
	missingHostMeritEventIds: number[];
	unexpectedHostMeritEventIds: number[];
	duplicateLinkedHostMeritEventIds: number[];
};

const TARGET_DATABASE_URL = requiredEnv(['MIGRATION_TARGET_DATABASE_URL', 'DATABASE_URL']);
const OUTPUT_PATH = 'data/centurion-host-merit-mismatches.json';

function pushEventId(map: Map<string, number[]>, userId: string, eventId: number) {
	const current = map.get(userId) ?? [];
	current.push(eventId);
	map.set(userId, current);
}

function difference(left: number[], right: number[]) {
	const rightSet = new Set(right);
	return left.filter((value) => !rightSet.has(value));
}

async function writeMismatchReport(params: {
	targetEventsFinalizedWithMerits: number;
	targetEventsConsidered: number;
	totalHostMeritsConsidered: number;
	totalLinkedHostMeritsConsidered: number;
	totalUnlinkedHostMeritsConsidered: number;
	totalUsersCompared: number;
	mismatchCount: number;
	mismatches: VerificationMismatch[];
}) {
	await mkdir(dirname(OUTPUT_PATH), { recursive: true });
	await writeFile(
		OUTPUT_PATH,
		`${JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				outputPath: OUTPUT_PATH,
				...params
			},
			null,
			2
		)}\n`,
		'utf8'
	);
}

async function main() {
	console.log(`Output path: ${OUTPUT_PATH}`);
	console.log(`Target DB: ${redactConnectionString(TARGET_DATABASE_URL)}`);

	const targetPool = new Pool({ connectionString: TARGET_DATABASE_URL });
	const prisma = new PrismaClient({
		adapter: new PrismaPg(targetPool)
	});

	try {
		const targetEvents = await prisma.event.findMany({
			where: {
				state: EventSessionState.FINALIZED_WITH_MERITS
			},
			select: {
				id: true,
				hostUserId: true
			},
			orderBy: {
				id: 'asc'
			}
		});

		const meritType = await prisma.meritType.findUniqueOrThrow({
			where: {
				code: MeritTypeCode.CENTURION_HOST_MERIT
			},
			select: {
				id: true
			}
		});

		const hostMerits = await prisma.merit.findMany({
			where: {
				meritTypeId: meritType.id
			},
			select: {
				userId: true,
				eventSessionId: true
			}
		});

		const hostedEventIdsByUserId = new Map<string, number[]>();
		for (const event of targetEvents) {
			pushEventId(hostedEventIdsByUserId, event.hostUserId, event.id);
		}

		const hostMeritEventIdsByUserId = new Map<string, number[]>();
		const unlinkedHostMeritCountByUserId = new Map<string, number>();
		for (const merit of hostMerits) {
			if (merit.eventSessionId === null) {
				unlinkedHostMeritCountByUserId.set(merit.userId, (unlinkedHostMeritCountByUserId.get(merit.userId) ?? 0) + 1);
				continue;
			}

			pushEventId(hostMeritEventIdsByUserId, merit.userId, merit.eventSessionId);
		}

		const comparedUserIds = [
			...new Set([...hostedEventIdsByUserId.keys(), ...hostMeritEventIdsByUserId.keys(), ...unlinkedHostMeritCountByUserId.keys()])
		];
		const users = comparedUserIds.length
			? await prisma.user.findMany({
					where: {
						id: {
							in: comparedUserIds
						}
					},
					select: {
						id: true,
						discordUserId: true,
						discordUsername: true,
						discordNickname: true
					}
				})
			: [];
		const userById = new Map(users.map((user) => [user.id, user]));

		const mismatches: VerificationMismatch[] = [];
		for (const userId of comparedUserIds) {
			const hostedEventIds = [...new Set(hostedEventIdsByUserId.get(userId) ?? [])].sort((left, right) => left - right);
			const linkedHostMeritEventIdsRaw = hostMeritEventIdsByUserId.get(userId) ?? [];
			const linkedHostMeritEventIds = [...new Set(linkedHostMeritEventIdsRaw)].sort((left, right) => left - right);
			const linkedHostMeritCount = linkedHostMeritEventIdsRaw.length;
			const unlinkedHostMeritCount = unlinkedHostMeritCountByUserId.get(userId) ?? 0;
			const hostMeritCount = linkedHostMeritCount + unlinkedHostMeritCount;
			const missingHostMeritEventIds = difference(hostedEventIds, linkedHostMeritEventIds);
			const unexpectedHostMeritEventIds = difference(linkedHostMeritEventIds, hostedEventIds);
			const duplicateLinkedHostMeritEventIds = [
				...new Set(linkedHostMeritEventIdsRaw.filter((eventId, index) => linkedHostMeritEventIdsRaw.indexOf(eventId) !== index))
			].sort((left, right) => left - right);

			if (
				hostedEventIds.length === hostMeritCount &&
				missingHostMeritEventIds.length === 0 &&
				unexpectedHostMeritEventIds.length === 0 &&
				duplicateLinkedHostMeritEventIds.length === 0
			) {
				continue;
			}

			const user = userById.get(userId);
			mismatches.push({
				userId,
				discordUserId: user?.discordUserId ?? 'unknown',
				discordUsername: user?.discordUsername ?? 'unknown',
				discordNickname: user?.discordNickname ?? 'unknown',
				hostedEventCount: hostedEventIds.length,
				hostMeritCount,
				linkedHostMeritCount,
				unlinkedHostMeritCount,
				missingHostMeritEventIds,
				unexpectedHostMeritEventIds,
				duplicateLinkedHostMeritEventIds
			});
		}

		mismatches.sort((left, right) => {
			const leftDelta = Math.abs(left.hostedEventCount - left.hostMeritCount);
			const rightDelta = Math.abs(right.hostedEventCount - right.hostMeritCount);
			if (leftDelta !== rightDelta) {
				return rightDelta - leftDelta;
			}

			return left.discordUserId.localeCompare(right.discordUserId);
		});

		const totalLinkedHostMeritsConsidered = [...hostMeritEventIdsByUserId.values()].reduce((total, eventIds) => total + eventIds.length, 0);
		const totalUnlinkedHostMeritsConsidered = [...unlinkedHostMeritCountByUserId.values()].reduce((total, count) => total + count, 0);

		await writeMismatchReport({
			targetEventsFinalizedWithMerits: targetEvents.length,
			targetEventsConsidered: targetEvents.length,
			totalHostMeritsConsidered: hostMerits.length,
			totalLinkedHostMeritsConsidered,
			totalUnlinkedHostMeritsConsidered,
			totalUsersCompared: comparedUserIds.length,
			mismatchCount: mismatches.length,
			mismatches
		});

		console.log('Centurion host merit verification finished');
		console.table({
			targetEventsFinalizedWithMerits: targetEvents.length,
			targetEventsConsidered: targetEvents.length,
			totalHostMeritsConsidered: hostMerits.length,
			totalLinkedHostMeritsConsidered,
			totalUnlinkedHostMeritsConsidered,
			totalUsersCompared: comparedUserIds.length,
			mismatchCount: mismatches.length
		});
		if (mismatches.length > 0) {
			console.error(`Found ${mismatches.length} centurion host merit mismatches. See ${OUTPUT_PATH}`);
			process.exitCode = 1;
		}
	} finally {
		await prisma.$disconnect();
		await targetPool.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
