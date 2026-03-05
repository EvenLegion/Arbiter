import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { z } from 'zod';

type NameChangeReviewDecision = 'approve' | 'deny';

export type ParsedNameChangeReviewButton = {
	decision: NameChangeReviewDecision;
	requestId: number;
};

type ParseNameChangeReviewButtonParams = {
	customId: string;
};

type BuildNameChangeReviewActionRowParams = {
	requestId: number;
	disabled?: boolean;
};

const REQUEST_ID_SCHEMA = z.coerce.number().int().positive();

export function parseNameChangeReviewButton({ customId }: ParseNameChangeReviewButtonParams): ParsedNameChangeReviewButton | null {
	const parts = customId.split(':');
	if (parts.length !== 4) {
		return null;
	}

	const [scope, domain, rawDecision, rawRequestId] = parts;
	if (scope !== 'ticket' || domain !== 'name_change_review') {
		return null;
	}

	if (rawDecision !== 'approve' && rawDecision !== 'deny') {
		return null;
	}

	const parsedRequestId = REQUEST_ID_SCHEMA.safeParse(rawRequestId);
	if (!parsedRequestId.success) {
		return null;
	}

	return {
		decision: rawDecision,
		requestId: parsedRequestId.data
	};
}

export function buildNameChangeReviewActionRow({ requestId, disabled = false }: BuildNameChangeReviewActionRowParams) {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(buildNameChangeReviewButtonCustomId({ requestId, decision: 'approve' }))
			.setLabel('Approve')
			.setStyle(ButtonStyle.Success)
			.setDisabled(disabled),
		new ButtonBuilder()
			.setCustomId(buildNameChangeReviewButtonCustomId({ requestId, decision: 'deny' }))
			.setLabel('Deny')
			.setStyle(ButtonStyle.Danger)
			.setDisabled(disabled)
	);
}

function buildNameChangeReviewButtonCustomId({ requestId, decision }: { requestId: number; decision: NameChangeReviewDecision }) {
	return `ticket:name_change_review:${decision}:${requestId}`;
}
