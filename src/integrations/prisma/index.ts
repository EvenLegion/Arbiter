export { prisma, closeDb } from './prisma';

export { upsertUser } from './upsertUser';
export { updateUserNickname } from './updateUserNickname';
export { findUniqueUser } from './findUniqueUser';
export { createNameChangeRequest } from './createNameChangeRequest';
export { findUniqueNameChangeRequest, isPendingNameChangeRequestStatus } from './findUniqueNameChangeRequest';
export { reviewNameChangeRequest } from './reviewNameChangeRequest';
export { saveNameChangeRequestReviewThread } from './saveNameChangeRequestReviewThread';
export { getUserMeritSummary, type UserMeritSummary, type MeritSummaryEntry } from './getUserMeritSummary';
export { getUserTotalMerits } from './getUserTotalMerits';
export { getUsersTotalMerits } from './getUsersTotalMerits';
export { awardManualMerit } from './awardManualMerit';

export {
	getCachedDivisions,
	getCachedDivisionByDbId,
	getCachedDivisionByDiscordRoleId,
	getCachedDivisionByCode,
	getCachedDivisionsByKind
} from './divisionCache/getCachedDivisions';
export { initializeDivisionCache } from './divisionCache/initDivisionCache';

export { findManyDivisions } from './findManyDivisions';
export { findManyDivisionMemberships } from './findManyDivisionMemberships';
export { findManyUsersDivisions } from './findManyUsersDivisions';

export { createManyDivisionMembership } from './createManyDivisionMembership';
export { deleteManyDivisionMembership } from './deleteManyDivisionMembership';

export {
	createDraftEventSession,
	deleteManyEventSessionChannels,
	finalizeEventReview,
	getEventReviewPage,
	findManyEventSessions,
	findReservedEventVoiceChannelReservation,
	findManyReservedEventVoiceChannelIds,
	findManyEventSessionMessages,
	findManyEventTiers,
	findFirstEventTier,
	findUniqueEventSession,
	updateEventSessionState,
	upsertEventReviewDecision,
	upsertEventSessionChannel,
	upsertEventSessionMessageRef,
	upsertManyEventParticipantStats,
	upsertManyEventReviewDecisions
} from './event';
