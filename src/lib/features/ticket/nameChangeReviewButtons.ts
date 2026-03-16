import { z } from 'zod';

import { createCustomIdCodec } from '../../discord/customId';

type NameChangeReviewAction = 'approve' | 'deny' | 'edit';

export type ParsedNameChangeReviewButton = {
	action: NameChangeReviewAction;
	requestId: number;
};

export type ParsedNameChangeReviewModal = {
	requestId: number;
};

type ParseNameChangeReviewButtonParams = {
	customId: string;
};

type ParseNameChangeReviewModalParams = {
	customId: string;
};

const REQUEST_ID_SCHEMA = z.coerce.number().int().positive();

export function parseNameChangeReviewButton({ customId }: ParseNameChangeReviewButtonParams): ParsedNameChangeReviewButton | null {
	return NAME_CHANGE_REVIEW_BUTTON_CODEC.parse(customId);
}

export function parseNameChangeReviewModal({ customId }: ParseNameChangeReviewModalParams): ParsedNameChangeReviewModal | null {
	return NAME_CHANGE_REVIEW_EDIT_MODAL_CODEC.parse(customId);
}

export function buildNameChangeReviewEditModalCustomId({ requestId }: { requestId: number }) {
	return NAME_CHANGE_REVIEW_EDIT_MODAL_CODEC.build({
		requestId
	});
}

export function buildNameChangeReviewButtonCustomId({ requestId, action }: { requestId: number; action: NameChangeReviewAction }) {
	return NAME_CHANGE_REVIEW_BUTTON_CODEC.build({
		requestId,
		action
	});
}

const NAME_CHANGE_REVIEW_BUTTON_CODEC = createCustomIdCodec<
	ParsedNameChangeReviewButton,
	{
		requestId: number;
		action: NameChangeReviewAction;
	}
>({
	prefix: ['ticket', 'name_change_review'],
	parseParts: ([rawDecision, rawRequestId]) => {
		if (rawDecision !== 'approve' && rawDecision !== 'deny' && rawDecision !== 'edit') {
			return null;
		}

		const parsedRequestId = REQUEST_ID_SCHEMA.safeParse(rawRequestId);
		if (!parsedRequestId.success) {
			return null;
		}

		return {
			action: rawDecision,
			requestId: parsedRequestId.data
		};
	},
	buildParts: ({ requestId, action }) => [action, requestId]
});

const NAME_CHANGE_REVIEW_EDIT_MODAL_CODEC = createCustomIdCodec<
	ParsedNameChangeReviewModal,
	{
		requestId: number;
	}
>({
	prefix: ['ticket', 'name_change_review', 'edit_modal'],
	parseParts: ([rawRequestId]) => {
		const parsedRequestId = REQUEST_ID_SCHEMA.safeParse(rawRequestId);
		if (!parsedRequestId.success) {
			return null;
		}

		return {
			requestId: parsedRequestId.data
		};
	},
	buildParts: ({ requestId }) => [requestId]
});
