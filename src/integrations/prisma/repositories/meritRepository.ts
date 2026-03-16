import { MeritTypeNotManualAwardableError, awardManualMerit } from '../awardManualMerit';
import { findManyMeritTypes } from '../findManyMeritTypes';
import { getUserMeritSummary } from '../getUserMeritSummary';
import { getUserTotalMerits } from '../getUserTotalMerits';
import { getUsersTotalMerits } from '../getUsersTotalMerits';

export { MeritTypeNotManualAwardableError };
export type { UserMeritSummary, MeritSummaryEntry } from '../getUserMeritSummary';

export const meritRepository = {
	awardManualMerit,
	listMeritTypes: findManyMeritTypes,
	getUserMeritSummary,
	getUserTotalMerits,
	getUsersTotalMerits
};
