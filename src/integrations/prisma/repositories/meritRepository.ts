import { MeritTypeNotManualAwardableError, awardManualMerit } from '../merit/write';
import { getUserMeritSummary } from '../merit/getUserMeritSummary';
import { getUserTotalMerits } from '../merit/getUserTotalMerits';
import { getUsersTotalMerits } from '../merit/getUsersTotalMerits';
import { listMeritTypes } from '../merit/listMeritTypes';

export { MeritTypeNotManualAwardableError };
export type { UserMeritSummary, MeritSummaryEntry } from '../merit/meritReadTypes';

export const meritRepository = {
	awardManualMerit,
	listMeritTypes,
	getUserMeritSummary,
	getUserTotalMerits,
	getUsersTotalMerits
};
