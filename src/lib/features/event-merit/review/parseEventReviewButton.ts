import {
	buildEventReviewAttendeeLabelButtonId,
	buildEventReviewDecisionButtonId,
	parseEventReviewDecisionButton
} from './eventReviewDecisionCustomId';
import { buildEventReviewPageButtonId, buildEventReviewPageIndicatorButtonId, parseEventReviewPageButton } from './eventReviewPagingCustomId';
import { buildEventReviewSubmitButtonId, parseEventReviewSubmitButton } from './eventReviewSubmissionCustomId';
import type { ParsedEventReviewButton } from './eventReviewButtonTypes';

type ParseEventReviewButtonParams = {
	customId: string;
};

export type { ParsedEventReviewButton } from './eventReviewButtonTypes';

export function parseEventReviewButton({ customId }: ParseEventReviewButtonParams): ParsedEventReviewButton | null {
	return parseEventReviewPageButton(customId) ?? parseEventReviewSubmitButton(customId) ?? parseEventReviewDecisionButton(customId);
}

export {
	buildEventReviewSubmitButtonId,
	buildEventReviewDecisionButtonId,
	buildEventReviewAttendeeLabelButtonId,
	buildEventReviewPageButtonId,
	buildEventReviewPageIndicatorButtonId
};
