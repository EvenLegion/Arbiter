import { DivisionKind } from '@prisma/client';
import { container } from '@sapphire/framework';
import { EmbedBuilder, MessageFlags, type APIEmbedField, type ModalSubmitInteraction } from 'discord.js';

import {
	findUniqueNameChangeRequest,
	isPendingNameChangeRequestStatus,
	updatePendingNameChangeRequestRequestedName
} from '../../../integrations/prisma';
import { isNicknameTooLongError } from '../../errors/nicknameTooLongError';
import type { ExecutionContext } from '../../logging/executionContext';
import {
	buildNameChangeReviewActionRow,
	NAME_CHANGE_REVIEW_EDIT_MODAL_REQUESTED_NAME_INPUT_ID,
	type ParsedNameChangeReviewModal
} from './nameChangeReviewButtons';
import { normalizeRequestedName } from './normalizeRequestedName';

type HandleNameChangeReviewEditModalParams = {
	interaction: ModalSubmitInteraction;
	parsedNameChangeReviewModal: ParsedNameChangeReviewModal;
	context: ExecutionContext;
};

export async function handleNameChangeReviewEditModal({ interaction, parsedNameChangeReviewModal, context }: HandleNameChangeReviewEditModalParams) {
	const caller = 'handleNameChangeReviewEditModal';
	const logger = context.logger.child({
		caller,
		nameChangeRequestId: parsedNameChangeReviewModal.requestId
	});

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const guild = await container.utilities.guild.getOrThrow().catch((error: unknown) => {
		logger.error(
			{
				err: error
			},
			'Failed to resolve configured guild while editing name change request'
		);
		return null;
	});
	if (!guild) {
		await interaction.editReply({
			content: 'This action can only be used in a server.'
		});
		return;
	}

	const reviewerMember = await container.utilities.member
		.getOrThrow({
			guild,
			discordUserId: interaction.user.id
		})
		.catch((error: unknown) => {
			logger.error(
				{
					err: error,
					discordUserId: interaction.user.id
				},
				'Failed to resolve reviewer member while editing name change request'
			);
			return null;
		});
	if (!reviewerMember) {
		await interaction.editReply({
			content: 'Could not resolve your member record in this server.'
		});
		return;
	}

	const isStaff = await container.utilities.divisionRolePolicy.memberHasDivisionKindRole({
		member: reviewerMember,
		requiredRoleKinds: [DivisionKind.STAFF]
	});
	if (!isStaff) {
		await interaction.editReply({
			content: 'Only staff members can edit name change requests.'
		});
		return;
	}

	const existingRequest = await findUniqueNameChangeRequest({
		requestId: parsedNameChangeReviewModal.requestId
	}).catch((error: unknown) => {
		logger.error(
			{
				err: error
			},
			'Failed to resolve name change request before edit'
		);
		return null;
	});
	if (!existingRequest || !isPendingNameChangeRequestStatus(existingRequest.status)) {
		await interaction.editReply({
			content: 'This request has already been reviewed.'
		});
		return;
	}

	const rawRequestedName = interaction.fields.getTextInputValue(NAME_CHANGE_REVIEW_EDIT_MODAL_REQUESTED_NAME_INPUT_ID).trim();
	const divisions = await container.utilities.divisionCache.get().catch((error: unknown) => {
		logger.error(
			{
				err: error
			},
			'Failed to resolve divisions while normalizing edited name change request'
		);
		return null;
	});
	if (!divisions) {
		await interaction.editReply({
			content: `Could not validate requested name. Please contact TECH with: requestId=${context.requestId}`
		});
		return;
	}

	const divisionPrefixes = divisions
		.flatMap((division) => [division.displayNamePrefix, division.code])
		.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
	const normalizedResult = normalizeRequestedName({
		rawRequestedName,
		divisionPrefixes
	});
	if (!normalizedResult.success) {
		await interaction.editReply({
			content: normalizedResult.errorMessage
		});
		return;
	}

	const requesterMember = await container.utilities.member
		.getOrThrow({
			guild,
			discordUserId: existingRequest.requesterUser.discordUserId
		})
		.catch((error: unknown) => {
			logger.error(
				{
					err: error,
					requesterDiscordUserId: existingRequest.requesterUser.discordUserId
				},
				'Failed to resolve requester member while validating edited requested name'
			);
			return null;
		});
	if (!requesterMember) {
		await interaction.editReply({
			content: `Could not resolve requester member for validation. Please contact TECH with: requestId=${context.requestId}`
		});
		return;
	}

	try {
		await container.utilities.member.computeNickname({
			member: requesterMember,
			context,
			baseDiscordNicknameOverride: normalizedResult.normalizedRequestedName,
			contextBindings: {
				step: 'validateEditedRequestedNameNicknameLength'
			}
		});
	} catch (error) {
		if (isNicknameTooLongError(error)) {
			await interaction.editReply({
				content: 'Edited requested name is too long after organization formatting/rank is applied. Please choose a shorter name.'
			});
			return;
		}

		logger.error(
			{
				err: error,
				nameChangeRequestId: parsedNameChangeReviewModal.requestId
			},
			'Failed to validate edited requested name'
		);
		await interaction.editReply({
			content: `Could not validate edited requested name. Please contact TECH with: requestId=${context.requestId}`
		});
		return;
	}

	const updatedRequest = await updatePendingNameChangeRequestRequestedName({
		requestId: parsedNameChangeReviewModal.requestId,
		requestedName: normalizedResult.normalizedRequestedName
	}).catch((error: unknown) => {
		logger.error(
			{
				err: error,
				nameChangeRequestId: parsedNameChangeReviewModal.requestId
			},
			'Failed to update pending name change requested name'
		);
		return null;
	});
	if (!updatedRequest) {
		await interaction.editReply({
			content: 'This request has already been reviewed.'
		});
		return;
	}

	if (interaction.message) {
		const updatedEmbed = buildEditedNameChangeEmbed({
			existingEmbed: interaction.message.embeds[0],
			requestedName: updatedRequest.requestedName
		});

		await interaction.message
			.edit({
				embeds: [updatedEmbed],
				components: [buildNameChangeReviewActionRow({ requestId: updatedRequest.id })]
			})
			.catch((error: unknown) => {
				logger.error(
					{
						err: error,
						nameChangeRequestId: updatedRequest.id
					},
					'Failed to update name change review message after requested name edit'
				);
			});
	}

	if (hasSendMethod(interaction.channel)) {
		await interaction.channel
			.send({
				content: `<@${interaction.user.id}> updated requested name from **${trimForEmbed(existingRequest.requestedName, 100)}** to **${trimForEmbed(updatedRequest.requestedName, 100)}**.`
			})
			.catch((error: unknown) => {
				logger.warn(
					{
						err: error,
						channelId: interaction.channelId
					},
					'Failed to post requested-name edit message in thread'
				);
			});
	}

	logger.info(
		{
			nameChangeRequestId: parsedNameChangeReviewModal.requestId,
			reviewerDiscordUserId: interaction.user.id,
			oldRequestedName: existingRequest.requestedName,
			newRequestedName: updatedRequest.requestedName
		},
		'Edited pending name change request requested name'
	);

	await interaction.deleteReply().catch(() => null);
}

function hasSendMethod(value: unknown): value is { send: (options: { content: string }) => Promise<unknown> } {
	return typeof value === 'object' && value !== null && 'send' in value && typeof value.send === 'function';
}

function buildEditedNameChangeEmbed({
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
