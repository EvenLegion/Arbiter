import { DivisionKind } from '@prisma/client';
import { container } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	MessageFlags,
	type ButtonInteraction,
	type ChatInputCommandInteraction,
	type Guild,
	type GuildMember
} from 'discord.js';

import { findUniqueUser, getUserMeritSummary, type MeritSummaryEntry } from '../../../integrations/prisma';
import type { ExecutionContext } from '../../logging/executionContext';
import type { ParsedMeritListButton } from './parseMeritListButton';

type HandleMeritListParams = {
	interaction: ChatInputCommandInteraction;
	context: ExecutionContext;
};

const MERIT_LIST_PAGE_SIZE = 10;

export async function handleMeritList({ interaction, context }: HandleMeritListParams) {
	const caller = 'handleMeritList';
	const logger = context.logger.child({ caller });

	let guild: Guild;
	try {
		guild = await container.utilities.guild.getOrThrow();
	} catch (error) {
		logger.error(
			{
				err: error
			},
			'Failed to resolve configured guild while handling merit list command'
		);
		await interaction.reply({
			content: `Could not resolve configured guild. Please contact TECH with: requestId=${context.requestId}`,
			ephemeral: true
		});
		return;
	}

	const requesterMember = await container.utilities.member
		.getOrThrow({
			guild,
			discordUserId: interaction.user.id
		})
		.catch((error: unknown) => {
			logger.error(
				{
					err: error
				},
				'Failed to resolve requester member for merit list command'
			);
			return null;
		});
	if (!requesterMember) {
		await interaction.reply({
			content: `Could not resolve your member record. Please contact TECH with: requestId=${context.requestId}`,
			ephemeral: true
		});
		return;
	}

	const requesterIsStaff = await container.utilities.divisionRolePolicy.memberHasDivisionKindRole({
		member: requesterMember,
		requiredRoleKinds: [DivisionKind.STAFF]
	});

	const requestedTargetUserId = interaction.options.getString('user_name')?.trim() ?? null;
	const targetMember = requestedTargetUserId
		? await guild.members.fetch(requestedTargetUserId).catch((error: unknown) => {
				logger.warn(
					{
						err: error,
						requestedTargetUserId
					},
					'Failed to resolve target member for merit list command'
				);
				return null;
			})
		: requesterMember;
	if (!targetMember || targetMember.user.bot) {
		await interaction.reply({
			content: 'Selected user was not found.',
			ephemeral: true
		});
		return;
	}

	if (!requesterIsStaff && targetMember.id !== requesterMember.id) {
		await interaction.reply({
			content: 'Only staff can list merits for another user.',
			ephemeral: true
		});
		return;
	}

	const requestedPrivate = interaction.options.getBoolean('private');
	const shouldReplyPrivately = requesterIsStaff ? (requestedPrivate ?? true) : true;
	const requestedPage = 1;

	await interaction.deferReply(shouldReplyPrivately ? { flags: MessageFlags.Ephemeral } : undefined);

	const targetDbUser = await findUniqueUser({
		discordUserId: targetMember.id
	});
	const meritSummary = targetDbUser
		? await getUserMeritSummary({
				userDbUserId: targetDbUser.id,
				page: requestedPage,
				pageSize: MERIT_LIST_PAGE_SIZE
			})
		: {
				totalMerits: 0,
				totalAwards: 0,
				totalLinkedEvents: 0,
				page: 1,
				pageSize: MERIT_LIST_PAGE_SIZE,
				totalPages: 1,
				entries: [] as MeritSummaryEntry[]
			};

	const embed = buildMeritListEmbed({
		targetMember,
		totalMerits: meritSummary.totalMerits,
		totalLinkedEvents: meritSummary.totalLinkedEvents,
		entries: meritSummary.entries
	});

	await interaction.editReply(
		buildMeritListPayload({
			embed,
			targetDiscordUserId: targetMember.id,
			page: meritSummary.page,
			totalPages: meritSummary.totalPages
		})
	);
}

type HandleMeritListPageButtonParams = {
	interaction: ButtonInteraction;
	parsedMeritListButton: ParsedMeritListButton;
	context: ExecutionContext;
};

export async function handleMeritListPageButton({ interaction, parsedMeritListButton, context }: HandleMeritListPageButtonParams) {
	const caller = 'handleMeritListPageButton';
	const logger = context.logger.child({
		caller,
		targetDiscordUserId: parsedMeritListButton.targetDiscordUserId,
		page: parsedMeritListButton.page
	});

	await interaction.deferUpdate().catch(() => null);

	let guild: Guild;
	try {
		guild = await container.utilities.guild.getOrThrow();
	} catch (error) {
		logger.error(
			{
				err: error
			},
			'Failed to resolve configured guild for merit list pagination'
		);
		await interaction
			.followUp({
				content: `Could not resolve configured guild. Please contact TECH with: requestId=${context.requestId}`,
				flags: MessageFlags.Ephemeral
			})
			.catch(() => null);
		return;
	}

	const targetMember = await guild.members.fetch(parsedMeritListButton.targetDiscordUserId).catch((error: unknown) => {
		logger.warn(
			{
				err: error
			},
			'Failed to resolve target member for merit list pagination'
		);
		return null;
	});
	if (!targetMember || targetMember.user.bot) {
		await interaction
			.followUp({
				content: 'Selected user was not found.',
				flags: MessageFlags.Ephemeral
			})
			.catch(() => null);
		return;
	}

	const targetDbUser = await findUniqueUser({
		discordUserId: targetMember.id
	});
	const meritSummary = targetDbUser
		? await getUserMeritSummary({
				userDbUserId: targetDbUser.id,
				page: parsedMeritListButton.page,
				pageSize: MERIT_LIST_PAGE_SIZE
			})
		: {
				totalMerits: 0,
				totalAwards: 0,
				totalLinkedEvents: 0,
				page: 1,
				pageSize: MERIT_LIST_PAGE_SIZE,
				totalPages: 1,
				entries: [] as MeritSummaryEntry[]
			};

	const embed = buildMeritListEmbed({
		targetMember,
		totalMerits: meritSummary.totalMerits,
		totalLinkedEvents: meritSummary.totalLinkedEvents,
		entries: meritSummary.entries
	});

	await interaction
		.editReply(
			buildMeritListPayload({
				embed,
				targetDiscordUserId: targetMember.id,
				page: meritSummary.page,
				totalPages: meritSummary.totalPages
			})
		)
		.catch((error: unknown) => {
			logger.warn(
				{
					err: error
				},
				'Failed to edit merit list page'
			);
		});
}

function buildMeritListEmbed({
	targetMember,
	totalMerits,
	totalLinkedEvents,
	entries
}: {
	targetMember: GuildMember;
	totalMerits: number;
	totalLinkedEvents: number;
	entries: MeritSummaryEntry[];
}) {
	const { description } = buildEntriesDescription({
		entries
	});

	return new EmbedBuilder()
		.setTitle(`Merits for ${targetMember.displayName}`)
		.setColor(0x2563eb)
		.addFields(
			{
				name: 'Total Merits',
				value: String(totalMerits),
				inline: true
			},
			{
				name: 'Merit Awarding Events',
				value: String(totalLinkedEvents),
				inline: true
			}
		)
		.setDescription(description);
}

function buildEntriesDescription({ entries }: { entries: MeritSummaryEntry[] }) {
	if (entries.length === 0) {
		return {
			description: 'No merit awards found.',
			shownCount: 0
		};
	}

	const maxDescriptionLength = 3_800;
	const chunks: string[] = [];
	let currentLength = 0;
	for (let index = 0; index < entries.length; index++) {
		const entry = entries[index];
		const timestamp = `<t:${Math.floor(entry.createdAt.getTime() / 1_000)}:f>`;
		const reason = trimForDisplay(entry.reason ?? 'No reason provided', 180);
		const event = entry.eventSession ? `${entry.eventSession.name} (#${entry.eventSession.id})` : 'No linked event';
		const chunk = `**+${entry.amount} merits** • ${timestamp}\nReason: ${reason}\nEvent: ${trimForDisplay(event, 140)}`;

		const extraLength = chunks.length === 0 ? chunk.length : chunk.length + 2;
		if (currentLength + extraLength > maxDescriptionLength) {
			break;
		}

		chunks.push(chunk);
		currentLength += extraLength;
	}

	return {
		description: chunks.join('\n\n'),
		shownCount: chunks.length
	};
}

function trimForDisplay(value: string, maxLength: number) {
	const trimmed = value.trim();
	if (trimmed.length <= maxLength) {
		return trimmed;
	}

	return `${trimmed.slice(0, Math.max(0, maxLength - 1))}...`;
}

function buildMeritListPayload({
	embed,
	targetDiscordUserId,
	page,
	totalPages
}: {
	embed: EmbedBuilder;
	targetDiscordUserId: string;
	page: number;
	totalPages: number;
}) {
	const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(buildMeritListPageButtonId({ targetDiscordUserId, page: Math.max(1, page - 1), source: 'prev' }))
			.setLabel('Prev')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page <= 1),
		new ButtonBuilder()
			.setCustomId(`merit:list:page-indicator:${targetDiscordUserId}:${page}`)
			.setLabel(`Page ${page}/${totalPages}`)
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
		new ButtonBuilder()
			.setCustomId(buildMeritListPageButtonId({ targetDiscordUserId, page: Math.min(totalPages, page + 1), source: 'next' }))
			.setLabel('Next')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page >= totalPages)
	);

	return {
		embeds: [embed],
		components: [controls]
	};
}

function buildMeritListPageButtonId({ targetDiscordUserId, page, source }: { targetDiscordUserId: string; page: number; source: 'prev' | 'next' }) {
	return `merit:list:page:${targetDiscordUserId}:${page}:${source}`;
}
