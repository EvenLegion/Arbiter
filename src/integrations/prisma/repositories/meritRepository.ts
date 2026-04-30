import { getMeritRankBreakdown } from '../merit/getMeritRankBreakdown';
import { MeritTypeNotManualAwardableError, awardManualMerit } from '../merit/write';
import { getUserMeritSummary } from '../merit/getUserMeritSummary';
import { getUserTotalMerits } from '../merit/getUserTotalMerits';
import { getUsersTotalMerits } from '../merit/getUsersTotalMerits';
import { listMeritTypes } from '../merit/listMeritTypes';

export { MeritTypeNotManualAwardableError };
export type { UserMeritSummary, MeritSummaryEntry, MeritRankBreakdownEntry } from '../merit/meritReadTypes';

export const meritRepository = {
	awardManualMerit,
	listMeritTypes,
	getMeritRankBreakdown,
	getUserMeritSummary,
	getUserTotalMerits,
	getUsersTotalMerits
};
