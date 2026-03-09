import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { z } from 'zod';

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

type BuildNameChangeReviewActionRowParams = {
	requestId: number;
	disabled?: boolean;
};

const REQUEST_ID_SCHEMA = z.coerce.number().int().positive();
export const NAME_CHANGE_REVIEW_EDIT_MODAL_REQUESTED_NAME_INPUT_ID = 'requested_name';

export function parseNameChangeReviewButton({ customId }: ParseNameChangeReviewButtonParams): ParsedNameChangeReviewButton | null {
	const parts = customId.split(':');
	if (parts.length !== 4) {
		return null;
	}

	const [scope, domain, rawDecision, rawRequestId] = parts;
	if (scope !== 'ticket' || domain !== 'name_change_review') {
		return null;
	}

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
}

export function parseNameChangeReviewModal({ customId }: ParseNameChangeReviewModalParams): ParsedNameChangeReviewModal | null {
	const parts = customId.split(':');
	if (parts.length !== 4) {
		return null;
	}

	const [scope, domain, kind, rawRequestId] = parts;
	if (scope !== 'ticket' || domain !== 'name_change_review' || kind !== 'edit_modal') {
		return null;
	}

	const parsedRequestId = REQUEST_ID_SCHEMA.safeParse(rawRequestId);
	if (!parsedRequestId.success) {
		return null;
	}

	return {
		requestId: parsedRequestId.data
	};
}

export function buildNameChangeReviewActionRow({ requestId, disabled = false }: BuildNameChangeReviewActionRowParams) {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(buildNameChangeReviewButtonCustomId({ requestId, action: 'approve' }))
			.setLabel('Approve')
			.setStyle(ButtonStyle.Success)
			.setDisabled(disabled),
		new ButtonBuilder()
			.setCustomId(buildNameChangeReviewButtonCustomId({ requestId, action: 'deny' }))
			.setLabel('Deny')
			.setStyle(ButtonStyle.Danger)
			.setDisabled(disabled),
		new ButtonBuilder()
			.setCustomId(buildNameChangeReviewButtonCustomId({ requestId, action: 'edit' }))
			.setLabel('Edit Name')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(disabled)
	);
}

export function buildNameChangeReviewEditModalCustomId({ requestId }: { requestId: number }) {
	return `ticket:name_change_review:edit_modal:${requestId}`;
}

function buildNameChangeReviewButtonCustomId({ requestId, action }: { requestId: number; action: NameChangeReviewAction }) {
	return `ticket:name_change_review:${action}:${requestId}`;
}
