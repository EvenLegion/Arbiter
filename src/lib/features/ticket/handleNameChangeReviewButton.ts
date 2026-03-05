import { DivisionKind, NameChangeRequestStatus } from '@prisma/client';
import { container } from '@sapphire/framework';
import { EmbedBuilder, MessageFlags, type APIEmbedField, type ButtonInteraction, type Guild } from 'discord.js';

import { reviewNameChangeRequest, updateUserNickname } from '../../../integrations/prisma';
import type { ExecutionContext } from '../../logging/executionContext';
import type { ParsedNameChangeReviewButton } from './nameChangeReviewButtons';
import { buildNameChangeReviewActionRow } from './nameChangeReviewButtons';

type HandleNameChangeReviewButtonParams = {
	interaction: ButtonInteraction;
	parsedNameChangeReviewButton: ParsedNameChangeReviewButton;
	context: ExecutionContext;
};

export async function handleNameChangeReviewButton({ interaction, parsedNameChangeReviewButton, context }: HandleNameChangeReviewButtonParams) {
	const caller = 'handleNameChangeReviewButton';
	const logger = context.logger.child({
		caller,
		requestId: parsedNameChangeReviewButton.requestId,
		decision: parsedNameChangeReviewButton.decision
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

	const reviewed = await reviewNameChangeRequest({
		requestId: parsedNameChangeReviewButton.requestId,
		reviewerDbUserId: reviewerDbUser.id,
		decision: parsedNameChangeReviewButton.decision
	}).catch((error: unknown) => {
		logger.error(
			{
				err: error
			},
			'Failed to update name change request review state'
		);
		return null;
	});
	if (!reviewed) {
		await interaction
			.followUp({
				content: 'This request has already been reviewed.',
				flags: MessageFlags.Ephemeral
			})
			.catch(() => null);
		return;
	}

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
				requestId: reviewed.id,
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
					requestId: parsedNameChangeReviewButton.requestId
				},
				'Failed to archive reviewed name change request thread'
			);
		});
	}

	logger.info(
		{
			requestId: parsedNameChangeReviewButton.requestId,
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

	await updateUserNickname({
		discordUserId: reviewed.requesterUser.discordUserId,
		discordNickname: reviewed.requestedName
	});

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
