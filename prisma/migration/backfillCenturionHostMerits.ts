import { PrismaPg } from '@prisma/adapter-pg';
import { EventSessionState, MeritTypeCode, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

import { redactConnectionString, requiredEnv } from './env';

const TARGET_DATABASE_URL = requiredEnv(['MIGRATION_TARGET_DATABASE_URL', 'DATABASE_URL']);

const DRY_RUN = false;
const FAIL_FAST = true;
const BATCH_SIZE = 1000;

function buildMeritKey({ eventSessionId, userId }: { eventSessionId: number; userId: string }) {
	return `${eventSessionId}:${userId}`;
}

async function main() {
	console.log(`Target DB: ${redactConnectionString(TARGET_DATABASE_URL)}`);
	console.log(`Dry run: ${DRY_RUN ? 'yes' : 'no'}`);

	const targetPool = new Pool({ connectionString: TARGET_DATABASE_URL });
	const prisma = new PrismaClient({
		adapter: new PrismaPg(targetPool)
	});

	try {
		const meritType = await prisma.meritType.findUniqueOrThrow({
			where: {
				code: MeritTypeCode.CENTURION_HOST_MERIT
			},
			select: {
				id: true
			}
		});

		const targetEvents = await prisma.event.findMany({
			where: {
				state: EventSessionState.FINALIZED_WITH_MERITS
			},
			select: {
				id: true,
				hostUserId: true,
				createdAt: true
			},
			orderBy: {
				id: 'asc'
			}
		});

		const existingHostMerits = targetEvents.length
			? await prisma.merit.findMany({
					where: {
						meritTypeId: meritType.id,
						eventSessionId: {
							in: targetEvents.map((event) => event.id)
						}
					},
					select: {
						eventSessionId: true,
						userId: true
					}
				})
			: [];
		const existingMeritKeys = new Set(
			existingHostMerits
				.filter((row): row is { eventSessionId: number; userId: string } => row.eventSessionId !== null)
				.map((row) =>
					buildMeritKey({
						eventSessionId: row.eventSessionId,
						userId: row.userId
					})
				)
		);

		const stats = {
			targetEventsFinalizedWithMerits: targetEvents.length,
			targetEventsConsidered: targetEvents.length,
			existingHostMeritsLinkedToEvents: existingHostMerits.length,
			skippedAlreadyAwarded: 0,
			rowsPrepared: 0,
			rowsInserted: 0,
			failed: 0
		};

		const createRows: {
			userId: string;
			awardedByUserId: string;
			meritTypeId: number;
			reason: string;
			eventSessionId: number;
			createdAt: Date;
			updatedAt: Date;
		}[] = [];

		for (const event of targetEvents) {
			try {
				const meritKey = buildMeritKey({
					eventSessionId: event.id,
					userId: event.hostUserId
				});
				if (existingMeritKeys.has(meritKey)) {
					stats.skippedAlreadyAwarded += 1;
					continue;
				}

				createRows.push({
					userId: event.hostUserId,
					awardedByUserId: event.hostUserId,
					meritTypeId: meritType.id,
					reason: 'Awarded for hosting',
					eventSessionId: event.id,
					createdAt: event.createdAt,
					updatedAt: event.createdAt
				});
			} catch (error) {
				stats.failed += 1;
				console.error(`Failed preparing host merit for event ${event.id}`, error);
				if (FAIL_FAST) {
					throw error;
				}
			}
		}

		stats.rowsPrepared = createRows.length;

		if (DRY_RUN) {
			console.log('Centurion host merit backfill dry run finished');
			console.table(stats);
			return;
		}

		for (let index = 0; index < createRows.length; index += BATCH_SIZE) {
			const batch = createRows.slice(index, index + BATCH_SIZE);
			const result = await prisma.merit.createMany({
				data: batch
			});
			stats.rowsInserted += result.count;
		}

		console.log('Centurion host merit backfill finished');
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
