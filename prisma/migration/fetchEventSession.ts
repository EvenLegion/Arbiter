import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { Pool } from 'pg';
import { redactConnectionString, requiredEnv } from './env';

type OldEventSessionRow = {
	id: number;
	rootSessionId: number | null;
	startedBy: string;
	startedAt: Date;
	endedAt: Date | null;
	status: string;
	meritTypeId: number | null;
	awardDescription: string | null;
};

type OldEventSessionParticipantRow = {
	eventSessionId: number;
	userId: string;
	totalSecondsPresent: number;
	totalSecondsSpeaking: number;
	lastJoinAt: Date | null;
	lastSpeakAt: Date | null;
	updatedAt: Date;
};

type DumpParticipant = {
	userId: string;
	totalSecondsPresent: number;
	totalSecondsSpeaking: number;
	lastJoinAt: string | null;
	lastSpeakAt: string | null;
	updatedAt: string;
	mappingPreview: {
		userId: string;
		attendedSeconds: number;
	};
};

type DumpEventSession = {
	id: number;
	rootSessionId: number | null;
	children: number[];
	startedBy: string;
	startedAt: string;
	endedAt: string | null;
	status: string;
	meritTypeId: number | null;
	awardDescription: string | null;
	participants: DumpParticipant[];
	mappingPreview: {
		id: number;
		hostUserId: string;
		createdAt: string;
		endedAt: string | null;
		stateFromOldStatus: string;
		eventTierId: number | null;
		name: string | null;
	};
};

const SOURCE_DATABASE_URL = requiredEnv('MIGRATION_SOURCE_DATABASE_URL');
const OUTPUT_PATH = 'data/old-event-sessions.json';

function mapOldStatusToNewState(oldStatus: string): string {
	switch (oldStatus) {
		case 'ACTIVE':
			return 'FINALIZED_WITH_MERITS';
		case 'ENDED':
			return 'FINALIZED_WITH_MERITS';
		default:
			return `UNMAPPED:${oldStatus}`;
	}
}

function toIso(value: Date | null): string | null {
	return value ? value.toISOString() : null;
}

async function main() {
	console.log(`Source DB: ${redactConnectionString(SOURCE_DATABASE_URL)}`);
	console.log(`Output path: ${OUTPUT_PATH}`);

	const pool = new Pool({ connectionString: SOURCE_DATABASE_URL });

	try {
		const sessionsResult = await pool.query<OldEventSessionRow>(
			`SELECT id, "rootSessionId", "startedBy", "startedAt", "endedAt", status, "meritTypeId", "awardDescription"
			 FROM "arbiter"."eventSession"
			 ORDER BY id ASC`
		);
		const participantsResult = await pool.query<OldEventSessionParticipantRow>(
			`SELECT "eventSessionId", "userId", "totalSecondsPresent", "totalSecondsSpeaking", "lastJoinAt", "lastSpeakAt", "updatedAt"
			 FROM "arbiter"."eventSessionParticipant"
			 ORDER BY "eventSessionId" ASC, "userId" ASC`
		);

		const participantsBySessionId = new Map<number, DumpParticipant[]>();
		for (const participant of participantsResult.rows) {
			const mapped: DumpParticipant = {
				userId: participant.userId,
				totalSecondsPresent: participant.totalSecondsPresent,
				totalSecondsSpeaking: participant.totalSecondsSpeaking,
				lastJoinAt: toIso(participant.lastJoinAt),
				lastSpeakAt: toIso(participant.lastSpeakAt),
				updatedAt: participant.updatedAt.toISOString(),
				mappingPreview: {
					userId: participant.userId,
					attendedSeconds: participant.totalSecondsPresent
				}
			};

			const existing = participantsBySessionId.get(participant.eventSessionId) ?? [];
			existing.push(mapped);
			participantsBySessionId.set(participant.eventSessionId, existing);
		}

		const childIdsByRootId = new Map<number, number[]>();
		for (const session of sessionsResult.rows) {
			if (session.rootSessionId === null) {
				continue;
			}

			const existing = childIdsByRootId.get(session.rootSessionId) ?? [];
			existing.push(session.id);
			childIdsByRootId.set(session.rootSessionId, existing);
		}

		const dumpSessions: DumpEventSession[] = sessionsResult.rows.map((session) => ({
			id: session.id,
			rootSessionId: session.rootSessionId,
			children: childIdsByRootId.get(session.id) ?? [],
			startedBy: session.startedBy,
			startedAt: session.startedAt.toISOString(),
			endedAt: toIso(session.endedAt),
			status: session.status,
			meritTypeId: session.meritTypeId,
			awardDescription: session.awardDescription,
			participants: participantsBySessionId.get(session.id) ?? [],
			mappingPreview: {
				id: session.id,
				hostUserId: session.startedBy,
				createdAt: session.startedAt.toISOString(),
				endedAt: toIso(session.endedAt),
				stateFromOldStatus: mapOldStatusToNewState(session.status),
				eventTierId: session.meritTypeId,
				name: session.awardDescription
			}
		}));

		const dump = {
			generatedAt: new Date().toISOString(),
			source: {
				database: redactConnectionString(SOURCE_DATABASE_URL),
				sessionTable: 'arbiter.eventSession',
				participantTable: 'arbiter.eventSessionParticipant'
			},
			counts: {
				sessions: dumpSessions.length,
				participants: participantsResult.rowCount
			},
			sessions: dumpSessions
		};

		await mkdir(dirname(OUTPUT_PATH), { recursive: true });
		await writeFile(OUTPUT_PATH, `${JSON.stringify(dump, null, 2)}\n`, 'utf8');
		console.log(`Wrote ${dumpSessions.length} event sessions to ${OUTPUT_PATH}`);
	} finally {
		await pool.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
