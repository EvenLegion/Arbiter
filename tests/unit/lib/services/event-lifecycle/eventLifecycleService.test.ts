import { EventReviewDecisionKind, EventSessionChannelKind, EventSessionState } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
	activateDraftEvent,
	addTrackedChannel,
	cancelDraftEvent,
	createEventDraft,
	endActiveEvent,
	finalizeEventReviewLifecycle,
	initializeEventReviewState,
	type EventLifecycleEventSession
} from '../../../../../src/lib/services/event-lifecycle/eventLifecycleService';

describe('eventLifecycleService', () => {
	it('creates a draft event and persists the tracking message references', async () => {
		const deps = {
			findEventTier: vi.fn().mockResolvedValue({
				id: 7,
				name: 'T2',
				code: 'T2',
				meritType: {
					meritAmount: 3
				}
			}),
			renamePrimaryVoiceChannel: vi.fn().mockResolvedValue(undefined),
			createTrackingThread: vi.fn().mockResolvedValue({
				threadId: 'thread-7'
			}),
			createDraftEventSession: vi.fn().mockResolvedValue({
				id: 11,
				name: 'Friday Op'
			}),
			saveEventThreadChannel: vi.fn().mockResolvedValue(undefined),
			postTrackingSummary: vi.fn().mockResolvedValue({
				threadSummaryMessageId: 'summary-1',
				parentVoiceSummaryMessageId: 'summary-parent-1'
			}),
			postThreadAnnouncement: vi.fn().mockResolvedValue(undefined),
			saveTrackingMessageRef: vi.fn().mockResolvedValue(undefined),
			saveParentVoiceSummaryMessageRef: vi.fn().mockResolvedValue(undefined),
			cleanupTrackingThread: vi.fn().mockResolvedValue(undefined)
		};

		const result = await createEventDraft(deps, {
			hostDbUserId: 'host-db-user',
			hostDiscordUserId: 'host-discord-user',
			issuerTag: 'Host#1234',
			eventTierId: 7,
			eventName: 'Friday Op',
			primaryVoiceChannelId: 'voice-1'
		});

		expect(result).toEqual({
			kind: 'draft_created',
			eventSessionId: 11,
			trackingThreadId: 'thread-7'
		});
		expect(deps.renamePrimaryVoiceChannel).toHaveBeenCalled();
		expect(deps.saveTrackingMessageRef).toHaveBeenCalledWith({
			eventSessionId: 11,
			channelId: 'thread-7',
			messageId: 'summary-1'
		});
		expect(deps.saveParentVoiceSummaryMessageRef).toHaveBeenCalledWith({
			eventSessionId: 11,
			channelId: 'voice-1',
			messageId: 'summary-parent-1'
		});
	});

	it('returns a typed reservation conflict when adding a tracked channel', async () => {
		const deps = {
			findEventSession: vi.fn().mockResolvedValue(buildEventSession()),
			findReservedChannelReservation: vi.fn().mockResolvedValue({
				eventSessionId: 99,
				eventSession: {
					name: 'Other Event',
					state: EventSessionState.ACTIVE
				}
			}),
			upsertTrackedChannel: vi.fn().mockResolvedValue(undefined),
			renameVoiceChannel: vi.fn().mockResolvedValue(undefined),
			syncTrackingSummary: vi.fn().mockResolvedValue(undefined),
			postEventThreadLog: vi.fn().mockResolvedValue(undefined),
			postPublicAnnouncement: vi.fn().mockResolvedValue({
				childPosted: true,
				parentPosted: true
			})
		};

		await expect(
			addTrackedChannel(deps, {
				actor: {
					...buildActor(),
					dbUserId: 'reviewer-db-user'
				},
				eventSessionId: 10,
				targetVoiceChannelId: 'child-2',
				renameTo: null,
				actorTag: 'Staff#1234'
			})
		).resolves.toEqual({
			kind: 'channel_reserved',
			channelId: 'child-2',
			eventSessionId: 99,
			eventName: 'Other Event',
			state: EventSessionState.ACTIVE
		});
		expect(deps.upsertTrackedChannel).not.toHaveBeenCalled();
	});

	it('activates a draft event and triggers tracking plus lifecycle presentation', async () => {
		const refreshed = buildEventSession({
			state: EventSessionState.ACTIVE
		});
		const deps = {
			findEventSession: vi.fn().mockResolvedValue(buildEventSession()),
			updateState: vi.fn().mockResolvedValue(true),
			reloadEventSession: vi.fn().mockResolvedValue(refreshed),
			syncLifecyclePresentation: vi.fn().mockResolvedValue(undefined),
			startTracking: vi.fn().mockResolvedValue(undefined),
			now: vi.fn().mockReturnValue(new Date('2026-03-15T10:00:00Z'))
		};

		const result = await activateDraftEvent(deps, {
			actor: buildActor(),
			eventSessionId: 10
		});

		expect(result).toEqual({
			kind: 'activated',
			eventSession: refreshed
		});
		expect(deps.updateState).toHaveBeenCalled();
		expect(deps.startTracking).toHaveBeenCalledWith({
			eventSessionId: 10,
			startedAtMs: new Date('2026-03-15T10:00:00Z').getTime()
		});
		expect(deps.syncLifecyclePresentation).toHaveBeenCalledWith({
			eventSession: refreshed,
			actorDiscordUserId: 'reviewer-1'
		});
	});

	it('cancels a draft event through the centralized transition service', async () => {
		const refreshed = buildEventSession({
			state: EventSessionState.CANCELLED
		});
		const deps = {
			findEventSession: vi.fn().mockResolvedValue(buildEventSession()),
			updateState: vi.fn().mockResolvedValue(true),
			reloadEventSession: vi.fn().mockResolvedValue(refreshed),
			syncLifecyclePresentation: vi.fn().mockResolvedValue(undefined),
			now: vi.fn().mockReturnValue(new Date('2026-03-15T10:00:00Z'))
		};

		await expect(
			cancelDraftEvent(deps, {
				actor: buildActor(),
				eventSessionId: 10
			})
		).resolves.toEqual({
			kind: 'cancelled',
			eventSession: refreshed
		});
	});

	it('rejects activation when the event is no longer in draft state', async () => {
		const deps = {
			findEventSession: vi.fn().mockResolvedValue(
				buildEventSession({
					state: EventSessionState.ACTIVE
				})
			),
			updateState: vi.fn(),
			reloadEventSession: vi.fn(),
			syncLifecyclePresentation: vi.fn(),
			now: vi.fn().mockReturnValue(new Date('2026-03-15T10:00:00Z'))
		};

		await expect(
			activateDraftEvent(deps, {
				actor: buildActor(),
				eventSessionId: 10
			})
		).resolves.toEqual({
			kind: 'invalid_state',
			currentState: EventSessionState.ACTIVE
		});
		expect(deps.updateState).not.toHaveBeenCalled();
	});

	it('rejects ending an event that is not currently active', async () => {
		const deps = {
			findEventSession: vi.fn().mockResolvedValue(buildEventSession()),
			updateState: vi.fn(),
			reloadEventSession: vi.fn(),
			syncLifecyclePresentation: vi.fn(),
			now: vi.fn().mockReturnValue(new Date('2026-03-15T10:00:00Z'))
		};

		await expect(
			endActiveEvent(deps, {
				actor: buildActor(),
				actorTag: 'Reviewer#1234',
				eventSessionId: 10
			})
		).resolves.toEqual({
			kind: 'invalid_state',
			currentState: EventSessionState.DRAFT
		});
		expect(deps.updateState).not.toHaveBeenCalled();
	});

	it('initializes review participants and reports when the review message could not sync', async () => {
		const deps = {
			findEventSession: vi.fn().mockResolvedValue({
				id: 10,
				state: EventSessionState.ENDED_PENDING_REVIEW,
				startedAt: new Date('2026-03-15T10:00:00Z'),
				endedAt: new Date('2026-03-15T11:00:00Z')
			}),
			getTrackingParticipantsSnapshot: vi.fn().mockResolvedValue([
				{
					discordUserId: 'known-user',
					attendedSeconds: 4_200
				},
				{
					discordUserId: 'missing-user',
					attendedSeconds: 1_200
				}
			]),
			findUsersByDiscordUserIds: vi.fn().mockResolvedValue([
				{
					id: 'known-db-user',
					discordUserId: 'known-user'
				}
			]),
			upsertParticipantStats: vi.fn().mockResolvedValue(undefined),
			upsertReviewDecisions: vi.fn().mockResolvedValue(undefined),
			clearTrackingSession: vi.fn().mockResolvedValue(undefined),
			syncReviewMessage: vi.fn().mockResolvedValue(false),
			defaultMinAttendancePercent: 50
		};

		const result = await initializeEventReviewState(deps, {
			eventSessionId: 10
		});

		expect(result).toEqual({
			kind: 'review_initialized_sync_failed',
			durationSeconds: 3600,
			snapshotParticipantCount: 2,
			persistedParticipantCount: 1
		});
		expect(deps.upsertParticipantStats).toHaveBeenCalledWith({
			eventSessionId: 10,
			participants: [
				{
					dbUserId: 'known-db-user',
					attendedSeconds: 3600
				}
			]
		});
		expect(deps.upsertReviewDecisions).toHaveBeenCalledWith({
			eventSessionId: 10,
			decisions: [
				{
					targetDbUserId: 'known-db-user',
					decision: EventReviewDecisionKind.MERIT
				}
			],
			overwriteExisting: false
		});
	});

	it('finalizes review and reports whether the review message sync succeeded', async () => {
		const finalizedSession = buildEventSession({
			state: EventSessionState.FINALIZED_WITH_MERITS
		});
		const deps = {
			findEventSession: vi.fn().mockResolvedValue({
				id: 10,
				state: EventSessionState.ENDED_PENDING_REVIEW
			}),
			finalizeReview: vi.fn().mockResolvedValue({
				finalized: true,
				toState: EventSessionState.FINALIZED_WITH_MERITS,
				awardedCount: 3,
				awardedMeritAmount: 2,
				awardedUsers: [
					{
						dbUserId: 'user-1',
						discordUserId: 'discord-1'
					}
				]
			}),
			syncAwardedNicknames: vi.fn().mockResolvedValue(undefined),
			reloadEventSession: vi.fn().mockResolvedValueOnce(finalizedSession).mockResolvedValueOnce(finalizedSession),
			syncTrackingSummary: vi.fn().mockResolvedValue(undefined),
			postReviewSubmissionMessages: vi.fn().mockResolvedValue(undefined),
			deleteTrackedChannelRows: vi.fn().mockResolvedValue(2),
			syncReviewMessage: vi.fn().mockResolvedValue(true)
		};

		const result = await finalizeEventReviewLifecycle(deps, {
			actor: {
				...buildActor(),
				dbUserId: 'reviewer-db-user'
			},
			eventSessionId: 10,
			mode: 'with'
		});

		expect(result).toEqual({
			kind: 'review_finalized',
			toState: EventSessionState.FINALIZED_WITH_MERITS,
			awardedCount: 3,
			reviewMessageSynced: true
		});
		expect(deps.syncAwardedNicknames).toHaveBeenCalledWith({
			awardedUsers: [
				{
					dbUserId: 'user-1',
					discordUserId: 'discord-1'
				}
			],
			awardedMeritAmount: 2
		});
	});

	it('finalizes review without merits and returns the finalized no-merits state', async () => {
		const finalizedSession = buildEventSession({
			state: EventSessionState.FINALIZED_NO_MERITS
		});
		const deps = {
			findEventSession: vi.fn().mockResolvedValue({
				id: 10,
				state: EventSessionState.ENDED_PENDING_REVIEW
			}),
			finalizeReview: vi.fn().mockResolvedValue({
				finalized: true,
				toState: EventSessionState.FINALIZED_NO_MERITS,
				awardedCount: 0,
				awardedMeritAmount: 0,
				awardedUsers: []
			}),
			syncAwardedNicknames: vi.fn().mockResolvedValue(undefined),
			reloadEventSession: vi.fn().mockResolvedValueOnce(finalizedSession).mockResolvedValueOnce(finalizedSession),
			syncTrackingSummary: vi.fn().mockResolvedValue(undefined),
			postReviewSubmissionMessages: vi.fn().mockResolvedValue(undefined),
			deleteTrackedChannelRows: vi.fn().mockResolvedValue(2),
			syncReviewMessage: vi.fn().mockResolvedValue(true)
		};

		await expect(
			finalizeEventReviewLifecycle(deps, {
				actor: {
					...buildActor(),
					dbUserId: 'reviewer-db-user'
				},
				eventSessionId: 10,
				mode: 'without'
			})
		).resolves.toEqual({
			kind: 'review_finalized',
			toState: EventSessionState.FINALIZED_NO_MERITS,
			awardedCount: 0,
			reviewMessageSynced: true
		});
	});
});

function buildActor() {
	return {
		discordUserId: 'reviewer-1',
		dbUserId: null,
		capabilities: {
			isStaff: true,
			isCenturion: false
		}
	};
}

function buildEventSession(overrides: Partial<EventLifecycleEventSession> = {}): EventLifecycleEventSession {
	return {
		id: 10,
		name: 'Training Op',
		state: EventSessionState.DRAFT,
		threadId: 'thread-10',
		hostUserId: 'host-db-user',
		eventTierId: 1,
		startedAt: null,
		endedAt: null,
		reviewFinalizedAt: null,
		reviewFinalizedByUserId: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		hostUser: {
			id: 'host-db-user',
			createdAt: new Date(),
			updatedAt: new Date(),
			discordUserId: 'host-discord-user',
			discordUsername: 'host-user',
			discordNickname: 'Host',
			discordAvatarUrl: 'https://example.com/avatar.png'
		},
		eventTier: {
			id: 1,
			createdAt: new Date(),
			updatedAt: new Date(),
			code: 'T2',
			name: 'Tier 2',
			meritTypeId: 2,
			meritType: {
				id: 2,
				createdAt: new Date(),
				updatedAt: new Date(),
				code: 'EVENT_ATTEND',
				name: 'Attend',
				description: '',
				meritAmount: 2,
				isManualAwardable: false
			}
		},
		channels: [
			{
				id: 1,
				eventSessionId: 10,
				channelId: 'parent-1',
				kind: EventSessionChannelKind.PARENT_VC,
				addedByUserId: 'host-db-user',
				createdAt: new Date(),
				updatedAt: new Date()
			}
		],
		eventMessages: [],
		...overrides
	} as EventLifecycleEventSession;
}
