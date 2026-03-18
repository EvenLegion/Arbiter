import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	type APIEmbedField
} from 'discord.js';

import { DISCORD_MAX_NICKNAME_LENGTH } from '../../../../constants';
import { buildNameChangeReviewButtonCustomId, buildNameChangeReviewEditModalCustomId } from '../nameChangeReviewCustomId';

type BuildNameChangeReviewActionRowParams = {
	requestId: number;
	disabled?: boolean;
};

export const NAME_CHANGE_REVIEW_EDIT_MODAL_REQUESTED_NAME_INPUT_ID = 'requested_name';

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

export function buildNameChangeReviewEditModal({ requestId, requestedName }: { requestId: number; requestedName: string }) {
	const textInput = new TextInputBuilder()
		.setCustomId(NAME_CHANGE_REVIEW_EDIT_MODAL_REQUESTED_NAME_INPUT_ID)
		.setLabel('Requested Name')
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setMinLength(1)
		.setMaxLength(DISCORD_MAX_NICKNAME_LENGTH)
		.setValue(requestedName.slice(0, DISCORD_MAX_NICKNAME_LENGTH));

	return new ModalBuilder()
		.setCustomId(buildNameChangeReviewEditModalCustomId({ requestId }))
		.setTitle('Edit Name Request')
		.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(textInput));
}

export function buildReviewedNameChangeEmbed({
	existingEmbed,
	statusLabel,
	reviewerDiscordUserId
}: {
	existingEmbed: Parameters<typeof EmbedBuilder.from>[0] | undefined;
	statusLabel: string;
	reviewerDiscordUserId: string;
}) {
	const embed = existingEmbed ? EmbedBuilder.from(existingEmbed) : new EmbedBuilder().setTitle('Name Change Request');
	const fields = [...(embed.data.fields ?? [])] as APIEmbedField[];

	upsertEmbedField({
		fields,
		name: 'Status',
		value: statusLabel,
		inline: true
	});
	upsertEmbedField({
		fields,
		name: 'Reviewed By',
		value: `<@${reviewerDiscordUserId}>`,
		inline: true
	});

	embed.setFields(fields);
	embed.setColor(statusLabel === 'Approved' ? 0x22c55e : 0xef4444);
	embed.setTimestamp(new Date());

	return embed;
}

export function buildEditedNameChangeEmbed({
	existingEmbed,
	requestedName
}: {
	existingEmbed: Parameters<typeof EmbedBuilder.from>[0] | undefined;
	requestedName: string;
}) {
	const embed = existingEmbed ? EmbedBuilder.from(existingEmbed) : new EmbedBuilder().setTitle('Name Change Request');
	const fields = [...(embed.data.fields ?? [])] as APIEmbedField[];

	upsertEmbedField({
		fields,
		name: 'Requested Name',
		value: trimForEmbed(requestedName, 100),
		inline: false
	});

	embed.setFields(fields);
	embed.setTimestamp(new Date());

	return embed;
}

function upsertEmbedField({ fields, name, value, inline = false }: { fields: APIEmbedField[]; name: string; value: string; inline?: boolean }) {
	const index = fields.findIndex((field) => field.name === name);
	if (index >= 0) {
		fields[index] = {
			name,
			value,
			inline
		};
		return;
	}

	fields.push({
		name,
		value,
		inline
	});
}

function trimForEmbed(value: string, maxLength: number) {
	const trimmed = value.trim();
	if (trimmed.length <= maxLength) {
		return trimmed;
	}

	return `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`;
}
