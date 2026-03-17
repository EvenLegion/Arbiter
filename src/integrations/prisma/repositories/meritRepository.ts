import { MeritTypeNotManualAwardableError, awardManualMerit } from '../merit/write';
import { getUserMeritSummary, getUserTotalMerits, getUsersTotalMerits } from '../merit/read';
import { listMeritTypes } from '../merit/listMeritTypes';

export { MeritTypeNotManualAwardableError };
export type { UserMeritSummary, MeritSummaryEntry } from '../merit/read';

export const meritRepository = {
	awardManualMerit,
	listMeritTypes,
	getUserMeritSummary,
	getUserTotalMerits,
	getUsersTotalMerits
};
