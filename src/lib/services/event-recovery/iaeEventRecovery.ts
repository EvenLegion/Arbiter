import { createHash } from 'node:crypto';
import type { ActorContext } from '../_shared/actor';

// Temporary incident-specific recovery. Remove after the approved recovery is verified.
export const IAE_EVENT_ID = 1011;
export const IAE_THREAD_ID = '1570926754548158665';
export const IAE_SNAPSHOT_PATH = '/app/recovery/event-1011-20261114T005813225334Z.json';
export const IAE_SNAPSHOT_SHA256 = 'f92db3c2fbbab8f1f8ec02beb1bd46055c94bd8c441340eaaffc5a5b8c7cd17d';
const STARTED_AT = '2026-11-14T00:17:02.898Z';
const ENDED_AT = '2026-11-14T00:25:27.703Z';

type IaeEvent = {
	id: number;
	name: string;
	threadId: string;
	hostUserId: string;
	eventTierId: number;
	state: string;
	startedAt: string | Date | null;
	endedAt: string | Date | null;
	expectedEventDuration: number | null;
	reviewFinalizedAt: string | Date | null;
	reviewFinalizedByUserId: string | null;
};
export type IaeRecoverySnapshot = {
	event: IaeEvent;
	guildId: string;
	metadata: Record<string, string>;
	attendance: Array<{ discordUserId: string; attendedSeconds: number }>;
	users: Array<{ id: string; discordUserId: string }>;
	participants: Array<{ dbUserId: string; attendedSeconds: number }>;
};
export type IaeRecoveryState = {
	event: IaeEvent | null;
	stats: Array<{ userId: string; attendedSeconds: number }>;
	decisions: Array<{ targetUserId: string; decision: string }>;
	meritCount: number;
	refs: Array<{ eventSessionId: number; kind: string; channelId: string; messageId: string }>;
	users: Array<{ id: string; discordUserId: string }>;
};
export type IaeTrackingState = { participants: Record<string, string>; metadata: Record<string, string>; active: boolean };
export type IaeReviewMessage = { id: string; channelId: string; attendeeCount: number };
export type IaeRecoveryLease = { ensureOwned: () => Promise<boolean>; release: () => Promise<void> };
export type IaeRecoveryDeps = {
	loadSnapshot: () => Promise<Buffer>;
	verifyRuntime: (snapshot: IaeRecoverySnapshot) => Promise<void>;
	readTracking: () => Promise<IaeTrackingState>;
	readState: (snapshot: IaeRecoverySnapshot) => Promise<IaeRecoveryState>;
	findReviewMessages: (snapshot: IaeRecoverySnapshot) => Promise<IaeReviewMessage[]>;
	acquireOperation: () => Promise<IaeRecoveryLease | null>;
	persistSnapshot: (snapshot: IaeRecoverySnapshot, lease: IaeRecoveryLease) => Promise<'insert' | 'none'>;
	persistReview: (
		snapshot: IaeRecoverySnapshot,
		existing: IaeReviewMessage | null,
		lease: IaeRecoveryLease
	) => Promise<{ message: IaeReviewMessage; action: 'post' | 'adopt' | 'none' }>;
};
export type IaeRecoveryResult =
	| { kind: 'forbidden' }
	| {
			kind: 'dry_run_ready' | 'recovered';
			databaseAction: 'insert' | 'none';
			messageAction: 'post' | 'adopt' | 'none';
			participantCount: 75;
			messageId?: string;
	  };
export class IaeRecoveryError extends Error {
	public constructor(
		public readonly code: string,
		public readonly phase = 'preflight'
	) {
		super(code);
		this.name = 'IaeRecoveryError';
	}
}
export function requireIae(condition: unknown, code: string): asserts condition {
	if (!condition) throw new IaeRecoveryError(code);
}
function canonical(rows: Array<[string, string | number]>) {
	return JSON.stringify([...rows].sort((a, b) => a[0].localeCompare(b[0])));
}
function iso(value: string | Date | null) {
	return value == null ? null : new Date(value).toISOString();
}

// The exact hash prevents arbitrary participant data being supplied through the command.
export function parseIaeSnapshot(bytes: Buffer): IaeRecoverySnapshot {
	requireIae(bytes.length <= 1024 * 1024 && createHash('sha256').update(bytes).digest('hex') === IAE_SNAPSHOT_SHA256, 'snapshot_integrity_failed');
	return normalizeIaeSnapshot(JSON.parse(bytes.toString('utf8')));
}
export function normalizeIaeSnapshot(input: unknown): IaeRecoverySnapshot {
	// Parsing follows a hash-verified incident artifact, but retain structural checks for clear failures.
	const s = input as {
		schemaVersion?: number;
		eventSessionId?: number;
		database?: {
			Event?: IaeEvent[];
			EventParticipantStat?: unknown[];
			EventReviewDecision?: unknown[];
			Merit?: unknown[];
			EventMessage?: Array<{ kind: string }>;
		};
		participantUserMapping?: Array<{ id: string; discordUserId: string }>;
		redis?: {
			participantsKey?: string;
			sessionKey?: string;
			participants?: Record<string, string>;
			metadata?: Record<string, string>;
			activeSetMembership?: number;
		};
	};
	requireIae(s?.schemaVersion === 1 && s.eventSessionId === IAE_EVENT_ID && s.database?.Event?.length === 1, 'snapshot_schema_failed');
	const event = s.database.Event[0]!;
	requireIae(
		event.id === IAE_EVENT_ID &&
			event.threadId === IAE_THREAD_ID &&
			event.name === '🔴 IAE LAUNCH DAY' &&
			event.state === 'ENDED_PENDING_REVIEW' &&
			iso(event.startedAt) === STARTED_AT &&
			iso(event.endedAt) === ENDED_AT &&
			event.expectedEventDuration === 90 &&
			event.reviewFinalizedAt === null &&
			event.reviewFinalizedByUserId === null,
		'snapshot_event_failed'
	);
	for (const key of ['EventParticipantStat', 'EventReviewDecision', 'Merit'] as const)
		requireIae(Array.isArray(s.database[key]) && s.database[key]!.length === 0, 'snapshot_not_original');
	requireIae(Array.isArray(s.database.EventMessage) && !s.database.EventMessage.some((r) => r.kind === 'REVIEW'), 'snapshot_has_review');
	requireIae(
		s.redis?.participantsKey === 'arbiter:event-tracking:participants:1011' &&
			s.redis.sessionKey === 'arbiter:event-tracking:session:1011' &&
			s.redis.metadata?.status === 'STOPPED' &&
			s.redis.activeSetMembership === 0 &&
			s.redis.participants,
		'snapshot_tracking_failed'
	);
	const metadata = s.redis.metadata;
	requireIae(typeof metadata.guildId === 'string' && /^\d+$/.test(metadata.guildId), 'snapshot_guild_failed');
	const attendance = Object.entries(s.redis.participants).map(([discordUserId, value]) => {
		requireIae(/^\d+$/.test(discordUserId) && typeof value === 'string' && /^(480|420|360|300)$/.test(value), 'snapshot_attendance_failed');
		return { discordUserId, attendedSeconds: Number(value) };
	});
	requireIae(
		attendance.length === 75 &&
			attendance.filter((p) => p.attendedSeconds === 480).length === 72 &&
			[420, 360, 300].every((n) => attendance.filter((p) => p.attendedSeconds === n).length === 1),
		'snapshot_distribution_failed'
	);
	const users = s.participantUserMapping;
	requireIae(
		Array.isArray(users) &&
			users.length === 75 &&
			users.every((u) => typeof u.id === 'string' && u.id.length > 0 && typeof u.discordUserId === 'string') &&
			new Set(users.map((u) => u.id)).size === 75 &&
			new Set(users.map((u) => u.discordUserId)).size === 75,
		'snapshot_mapping_failed'
	);
	const map = new Map(users.map((u) => [u.discordUserId, u.id]));
	const participants = attendance.map((p) => {
		const dbUserId = map.get(p.discordUserId);
		requireIae(dbUserId, 'snapshot_unmapped');
		return { dbUserId, attendedSeconds: p.attendedSeconds };
	});
	return { event, guildId: metadata.guildId, metadata, attendance, users, participants };
}
export function assertIaeRecoveryState(state: IaeRecoveryState, snapshot: IaeRecoverySnapshot): 'empty' | 'complete' {
	const event = state.event;
	requireIae(
		event &&
			event.id === IAE_EVENT_ID &&
			event.threadId === IAE_THREAD_ID &&
			event.name === snapshot.event.name &&
			event.state === 'ENDED_PENDING_REVIEW' &&
			iso(event.startedAt) === STARTED_AT &&
			iso(event.endedAt) === ENDED_AT &&
			event.expectedEventDuration === 90 &&
			event.reviewFinalizedAt === null &&
			event.reviewFinalizedByUserId === null &&
			event.hostUserId === snapshot.event.hostUserId &&
			event.eventTierId === snapshot.event.eventTierId,
		'event_changed'
	);
	requireIae(state.meritCount === 0, 'awards_already_present');
	requireIae(
		canonical(state.users.map((u) => [u.discordUserId, u.id])) === canonical(snapshot.users.map((u) => [u.discordUserId, u.id])),
		'user_mapping_changed'
	);
	requireIae(
		state.refs.length <= 1 && state.refs.every((r) => r.eventSessionId === IAE_EVENT_ID && r.kind === 'REVIEW' && r.channelId === IAE_THREAD_ID),
		'review_reference_changed'
	);
	if (state.stats.length === 0 && state.decisions.length === 0) {
		requireIae(state.refs.length === 0, 'reference_without_attendance');
		return 'empty';
	}
	requireIae(
		canonical(state.stats.map((p) => [p.userId, p.attendedSeconds])) ===
			canonical(snapshot.participants.map((p) => [p.dbUserId, p.attendedSeconds])),
		'attendance_partial_or_changed'
	);
	requireIae(
		canonical(state.decisions.map((d) => [d.targetUserId, d.decision])) === canonical(snapshot.participants.map((p) => [p.dbUserId, 'MERIT'])),
		'decisions_partial_or_changed'
	);
	return 'complete';
}
export function assertIaeTracking(tracking: IaeTrackingState, snapshot: IaeRecoverySnapshot) {
	requireIae(!tracking.active && tracking.metadata.status === 'STOPPED', 'tracking_not_stopped');
	requireIae(
		canonical(Object.entries(tracking.participants).map(([id, n]) => [id, Number(n)])) ===
			canonical(snapshot.attendance.map((p) => [p.discordUserId, p.attendedSeconds])),
		'tracking_attendance_changed'
	);
	for (const key of ['guildId', 'startedAtMs', 'lastTickAtMs', 'status'])
		requireIae(tracking.metadata[key] === snapshot.metadata[key], 'tracking_metadata_changed');
}
export function assertIaeReviewMessage(message: IaeReviewMessage) {
	requireIae(message.channelId === IAE_THREAD_ID && message.attendeeCount === 75, 'existing_review_mismatch');
}
function reconcileReferences(state: IaeRecoveryState, messages: IaeReviewMessage[], mode: 'empty' | 'complete') {
	requireIae(messages.length <= 1, 'multiple_review_messages');
	if (messages[0]) {
		requireIae(mode === 'complete', 'message_without_verified_attendance');
		assertIaeReviewMessage(messages[0]);
	}
	if (state.refs.length) requireIae(messages[0]?.id === state.refs[0]!.messageId, 'referenced_message_not_reconciled');
}
export async function runIaeEventRecovery(deps: IaeRecoveryDeps, input: { actor: ActorContext; apply: boolean }): Promise<IaeRecoveryResult> {
	if (!input.actor.capabilities.isStaff) return { kind: 'forbidden' };
	let phase = 'preflight';
	let lease: IaeRecoveryLease | null = null;
	try {
		const snapshot = parseIaeSnapshot(await deps.loadSnapshot());
		await deps.verifyRuntime(snapshot);
		assertIaeTracking(await deps.readTracking(), snapshot);
		let state = await deps.readState(snapshot);
		const mode = assertIaeRecoveryState(state, snapshot);
		let messages = await deps.findReviewMessages(snapshot);
		reconcileReferences(state, messages, mode);
		if (!input.apply)
			return {
				kind: 'dry_run_ready',
				databaseAction: mode === 'empty' ? 'insert' : 'none',
				messageAction: messages.length ? (state.refs.length ? 'none' : 'adopt') : 'post',
				participantCount: 75
			};
		lease = await deps.acquireOperation();
		requireIae(lease, 'event_operation_busy');
		requireIae(await lease.ensureOwned(), 'lease_lost');
		phase = 'persisting_attendance';
		const databaseAction = await deps.persistSnapshot(snapshot, lease);
		phase = 'verifying_attendance';
		requireIae(assertIaeRecoveryState(await deps.readState(snapshot), snapshot) === 'complete', 'post_commit_verification_failed');
		assertIaeTracking(await deps.readTracking(), snapshot);
		requireIae(await lease.ensureOwned(), 'lease_lost');
		phase = 'reconciling_review';
		state = await deps.readState(snapshot);
		messages = await deps.findReviewMessages(snapshot);
		reconcileReferences(state, messages, assertIaeRecoveryState(state, snapshot));
		const presentation = await deps.persistReview(snapshot, messages[0] ?? null, lease);
		phase = 'verifying_result';
		state = await deps.readState(snapshot);
		requireIae(assertIaeRecoveryState(state, snapshot) === 'complete', 'final_state_verification_failed');
		requireIae(state.refs.length === 1 && state.refs[0]!.messageId === presentation.message.id, 'final_reference_verification_failed');
		messages = await deps.findReviewMessages(snapshot);
		requireIae(messages.length === 1 && messages[0]!.id === presentation.message.id, 'final_message_verification_failed');
		assertIaeReviewMessage(messages[0]!);
		assertIaeTracking(await deps.readTracking(), snapshot);
		return { kind: 'recovered', databaseAction, messageAction: presentation.action, participantCount: 75, messageId: presentation.message.id };
	} catch (error) {
		throw new IaeRecoveryError(error instanceof IaeRecoveryError ? error.code : 'dependency_failed', phase);
	} finally {
		if (lease) await lease.release().catch(() => undefined);
	}
}
