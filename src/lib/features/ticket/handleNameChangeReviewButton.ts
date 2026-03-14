import { DivisionKind, NameChangeRequestStatus } from '@prisma/client';
import { container } from '@sapphire/framework';
import {
	ActionRowBuilder,
	EmbedBuilder,
	MessageFlags,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	type APIEmbedField,
	type ButtonInteraction,
	type Guild
} from 'discord.js';

import {
	findUniqueNameChangeRequest,
	isPendingNameChangeRequestStatus,
	reviewNameChangeRequest,
	updateUserNickname
} from '../../../integrations/prisma';
import { DISCORD_MAX_NICKNAME_LENGTH } from '../../constants';
import { isNicknameTooLongError } from '../../errors/nicknameTooLongError';
import type { ExecutionContext } from '../../logging/executionContext';
import type { ParsedNameChangeReviewButton } from './nameChangeReviewButtons';
import { reviewNameChangeDecision } from './nameChangeReviewService';
import {
	buildNameChangeReviewActionRow,
	buildNameChangeReviewEditModalCustomId,
	NAME_CHANGE_REVIEW_EDIT_MODAL_REQUESTED_NAME_INPUT_ID
} from './nameChangeReviewButtons';

type HandleNameChangeReviewButtonParams = {
	interaction: ButtonInteraction;
	parsedNameChangeReviewButton: ParsedNameChangeReviewButton;
	context: ExecutionContext;
};

export async function handleNameChangeReviewButton({ interaction, parsedNameChangeReviewButton, context }: HandleNameChangeReviewButtonParams) {
	const caller = 'handleNameChangeReviewButton';
	const logger = context.logger.child({
		caller,
		nameChangeRequestId: parsedNameChangeReviewButton.requestId,
		action: parsedNameChangeReviewButton.action
	});

	const guild = await container.utilities.guild.getOrThrow().catch((error: unknown) => {
		logger.error(
			{
				err: error
			},
			'Failed to resolve configured guild while reviewing name change request'
		);
		return null;
	});
	if (!guild) {
		await interaction.reply({
			content: 'This action can only be used in a server.',
			flags: MessageFlags.Ephemeral
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
				'Failed to resolve reviewer member while reviewing name change request'
			);
			return null;
		});
	if (!reviewerMember) {
		await interaction.reply({
			content: 'Could not resolve your member record in this server.',
			flags: MessageFlags.Ephemeral
		});
		return;
	}

	const isStaff = await container.utilities.divisionRolePolicy.memberHasDivisionKindRole({
		member: reviewerMember,
		requiredRoleKinds: [DivisionKind.STAFF]
	});
	if (!isStaff) {
		await interaction.reply({
			content: 'Only staff members can review name change requests.',
			flags: MessageFlags.Ephemeral
		});
		return;
	}

	if (parsedNameChangeReviewButton.action === 'edit') {
		const request = await findUniqueNameChangeRequest({
			requestId: parsedNameChangeReviewButton.requestId
		}).catch((error: unknown) => {
			logger.error(
				{
					err: error
				},
				'Failed to resolve name change request before opening edit modal'
			);
			return null;
		});
		if (!request || !isPendingNameChangeRequestStatus(request.status)) {
			await interaction.reply({
				content: 'This request has already been reviewed.',
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		const modalShown = await interaction
			.showModal(buildEditNameModal({ requestId: request.id, requestedName: request.requestedName }))
			.then(() => true)
			.catch((error: unknown) => {
				logger.error(
					{
						err: error,
						nameChangeRequestId: request.id
					},
					'Failed to show edit name modal'
				);
				return false;
			});
		if (!modalShown && !interaction.replied && !interaction.deferred) {
			await interaction
				.reply({
					content: `Failed to open edit modal. Please try again. requestId=${context.requestId}`,
					flags: MessageFlags.Ephemeral
				})
				.catch(() => null);
		}
		return;
	}

	await interaction.deferUpdate().catch(() => null);

	const reviewerDbUser = await container.utilities.userDirectory
		.getOrThrow({
			discordUserId: interaction.user.id
		})
		.catch((error: unknown) => {
			logger.error(
				{
					err: error,
					discordUserId: interaction.user.id
				},
				'Failed to resolve reviewer database user while reviewing name change request'
			);
			return null;
		});
	if (!reviewerDbUser) {
		await interaction.followUp({
			content: `Could not resolve your database user. Please contact TECH with: requestId=${context.requestId}`,
			flags: MessageFlags.Ephemeral
		});
		return;
	}

	let reviewResult: Awaited<ReturnType<typeof reviewNameChangeDecision>>;
	try {
		reviewResult = await reviewNameChangeDecision(
			{
				findRequest: findUniqueNameChangeRequest,
				validateApproval: async (request) => {
					const requesterMember = await container.utilities.member
						.getOrThrow({
							guild,
							discordUserId: request.requesterUser.discordUserId
						})
						.catch((error: unknown) => {
							logger.error(
								{
									err: error,
									requesterDiscordUserId: request.requesterUser.discordUserId
								},
								'Failed to resolve requester member while validating approved name change request'
							);
							return null;
						});
					if (!requesterMember) {
						throw new NameChangeReviewValidationError('requester-member-not-found');
					}

					try {
						await container.utilities.member.computeNickname({
							member: requesterMember,
							context,
							baseDiscordNicknameOverride: request.requestedName,
							contextBindings: {
								step: 'validateApprovedNameNicknameLength'
							}
						});
						return {
							ok: true
						} as const;
					} catch (error) {
						if (isNicknameTooLongError(error)) {
							return {
								ok: false,
								reason: 'nickname-too-long'
							} as const;
						}

						logger.error(
							{
								err: error,
								nameChangeRequestId: parsedNameChangeReviewButton.requestId
							},
							'Failed to validate approved name change request nickname length'
						);
						throw new NameChangeReviewValidationError('approval-validation-failed');
					}
				},
				reviewRequest: reviewNameChangeRequest,
				updatePersistedNickname: async (params) => {
					await updateUserNickname(params);
				},
				syncApprovedNickname: async (reviewed) => {
					await applyApprovedNameChangeNicknameSync({
						guild,
						reviewed,
						context,
						logger
					});
				}
			},
			{
				requestId: parsedNameChangeReviewButton.requestId,
				reviewerDbUserId: reviewerDbUser.id,
				decision: parsedNameChangeReviewButton.action
			}
		);
	} catch (error) {
		if (error instanceof NameChangeReviewValidationError) {
			if (error.reason === 'requester-member-not-found') {
				await interaction.followUp({
					content: `Could not resolve requester member for validation. Please contact TECH with: requestId=${context.requestId}`,
					flags: MessageFlags.Ephemeral
				});
				return;
			}

			await interaction.followUp({
				content: `Could not validate the requested name. Please contact TECH with: requestId=${context.requestId}`,
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		logger.error(
			{
				err: error
			},
			'Failed to review name change request'
		);
		await interaction
			.followUp({
				content: `Could not review this request. Please contact TECH with: requestId=${context.requestId}`,
				flags: MessageFlags.Ephemeral
			})
			.catch(() => null);
		return;
	}

	if (reviewResult.outcome === 'already-reviewed') {
		await interaction
			.followUp({
				content: 'This request has already been reviewed.',
				flags: MessageFlags.Ephemeral
			})
			.catch(() => null);
		return;
	}

	if (reviewResult.outcome === 'nickname-too-long') {
		await interaction.followUp({
			content:
				'Cannot approve this request because the resulting nickname would exceed Discord limits after organization formatting/rank is applied. Ask the requester for a shorter name.',
			flags: MessageFlags.Ephemeral
		});
		return;
	}

	const reviewed = reviewResult.reviewed;

	const reviewStatusLabel = reviewed.status === NameChangeRequestStatus.APPROVED ? 'Approved' : 'Denied';
	const decisionVerb = reviewed.status === NameChangeRequestStatus.APPROVED ? 'approved' : 'denied';
	try {
		await applyApprovedNameChangeNicknameSync({
			guild,
			reviewed,
			context,
			logger
		});
	} catch (error) {
		logger.error(
			{
				err: error,
				nameChangeRequestId: reviewed.id,
				requesterDiscordUserId: reviewed.requesterUser.discordUserId
			},
			'Failed to apply approved name change nickname sync'
		);

		await interaction
			.followUp({
				content: `Request was reviewed, but nickname sync failed. Please contact TECH with: requestId=${context.requestId}`,
				flags: MessageFlags.Ephemeral
			})
			.catch(() => null);
		return;
	}

	const updatedEmbed = buildReviewedNameChangeEmbed({
		existingEmbed: interaction.message.embeds[0],
		statusLabel: reviewStatusLabel,
		reviewerDiscordUserId: interaction.user.id
	});

	await interaction.message
		.edit({
			embeds: [updatedEmbed],
			components: [
				buildNameChangeReviewActionRow({
					requestId: parsedNameChangeReviewButton.requestId,
					disabled: true
				})
			]
		})
		.catch((error: unknown) => {
			logger.error(
				{
					err: error
				},
				'Failed to update name change review message after decision'
			);
		});

	if (hasSendMethod(interaction.channel)) {
		await interaction.channel
			.send({
				content: `<@${reviewed.requesterUser.discordUserId}>, your request was ${decisionVerb} by <@${interaction.user.id}>.`
			})
			.catch((error: unknown) => {
				logger.warn(
					{
						err: error,
						channelId: interaction.channelId
					},
					'Failed to post name change review outcome message in thread'
				);
			});
	}

	if (interaction.channel?.isThread() && !interaction.channel.archived) {
		await interaction.channel.setArchived(true, `Name change request ${decisionVerb} by ${interaction.user.tag}`).catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					channelId: interaction.channelId,
					nameChangeRequestId: parsedNameChangeReviewButton.requestId
				},
				'Failed to archive reviewed name change request thread'
			);
		});
	}

	logger.info(
		{
			nameChangeRequestId: parsedNameChangeReviewButton.requestId,
			reviewerDiscordUserId: interaction.user.id,
			reviewerDbUserId: reviewerDbUser.id,
			status: reviewed.status,
			requesterDiscordUserId: reviewed.requesterUser.discordUserId
		},
		'Reviewed name change request'
	);
}

async function applyApprovedNameChangeNicknameSync({
	guild,
	reviewed,
	context,
	logger
}: {
	guild: Guild;
	reviewed: NonNullable<Awaited<ReturnType<typeof reviewNameChangeRequest>>>;
	context: ExecutionContext;
	logger: ExecutionContext['logger'];
}) {
	if (reviewed.status !== NameChangeRequestStatus.APPROVED) {
		return;
	}

	const requesterMember = await container.utilities.member.getOrThrow({
		guild,
		discordUserId: reviewed.requesterUser.discordUserId
	});

	const nicknameSyncResult = await container.utilities.member.syncComputedNickname({
		member: requesterMember,
		context,
		setReason: 'Approved name change request',
		contextBindings: {
			step: 'buildUserNicknameForApprovedNameChange'
		}
	});

	logger.info(
		{
			requesterDiscordUserId: reviewed.requesterUser.discordUserId,
			requestedName: reviewed.requestedName,
			updatedNickname: nicknameSyncResult.member.displayName,
			nicknameSyncOutcome: nicknameSyncResult.outcome,
			nicknameSyncSkipReason: nicknameSyncResult.outcome === 'skipped' ? nicknameSyncResult.reason : undefined
		},
		'Applied approved name change request nickname sync'
	);
}

class NameChangeReviewValidationError extends Error {
	public constructor(public readonly reason: 'requester-member-not-found' | 'approval-validation-failed') {
		super(reason);
		this.name = 'NameChangeReviewValidationError';
	}
}

function hasSendMethod(value: unknown): value is { send: (options: { content: string }) => Promise<unknown> } {
	return typeof value === 'object' && value !== null && 'send' in value && typeof value.send === 'function';
}

function buildReviewedNameChangeEmbed({
	existingEmbed,
	statusLabel,
	reviewerDiscordUserId
}: {
	existingEmbed: ButtonInteraction['message']['embeds'][number] | undefined;
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

function buildEditNameModal({ requestId, requestedName }: { requestId: number; requestedName: string }) {
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
