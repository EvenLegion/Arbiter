import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

import type { MeritSummaryEntry } from '../../../../integrations/prisma/repositories';
import { buildMeritRankProgressBar, resolveMeritRankProgress } from '../../../services/merit-rank/meritRank';
import { buildMeritListPageButtonId, buildMeritListPageIndicatorButtonId } from './meritListButtonCustomId';

type BuildMeritListPayloadParams = {
	targetDiscordUserId: string;
	targetDisplayName: string;
	totalMerits: number;
	totalLinkedEvents: number;
	page: number;
	totalPages: number;
	entries: MeritSummaryEntry[];
};

export function buildMeritListPayload({
	targetDiscordUserId,
	targetDisplayName,
	totalMerits,
	totalLinkedEvents,
	page,
	totalPages,
	entries
}: BuildMeritListPayloadParams) {
	const embed = buildMeritListEmbed({
		targetDisplayName,
		totalMerits,
		totalLinkedEvents,
		entries
	});
	const prevPage = Math.max(1, page - 1);
	const nextPage = Math.min(totalPages, page + 1);
	const prevDisabled = page <= 1;
	const nextDisabled = page >= totalPages;

	const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(
				prevDisabled
					? buildDisabledMeritListPageButtonId({
							targetDiscordUserId,
							page,
							direction: 'prev'
						})
					: buildMeritListPageButtonId({ targetDiscordUserId, page: prevPage })
			)
			.setLabel('Prev')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(prevDisabled),
		new ButtonBuilder()
			.setCustomId(buildMeritListPageIndicatorButtonId({ targetDiscordUserId, page }))
			.setLabel(`Page ${page}/${totalPages}`)
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
		new ButtonBuilder()
			.setCustomId(
				nextDisabled
					? buildDisabledMeritListPageButtonId({
							targetDiscordUserId,
							page,
							direction: 'next'
						})
					: buildMeritListPageButtonId({ targetDiscordUserId, page: nextPage })
			)
			.setLabel('Next')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(nextDisabled)
	);

	return {
		embeds: [embed],
		components: [controls]
	};
}

function buildMeritListEmbed({
	targetDisplayName,
	totalMerits,
	totalLinkedEvents,
	entries
}: {
	targetDisplayName: string;
	totalMerits: number;
	totalLinkedEvents: number;
	entries: MeritSummaryEntry[];
}) {
	const description = buildEntriesDescription({
		entries
	});
	const rankProgress = resolveMeritRankProgress(totalMerits);
	const currentRankLabel = rankProgress.currentLevel ? `Level ${rankProgress.currentLevel}` : 'Unranked';
	const progressValue = rankProgress.nextLevel
		? [
				`To Level ${rankProgress.nextLevel}: ${buildMeritRankProgressBar({ progressRatio: rankProgress.progressRatio })} ${rankProgress.progressPercent}%`,
				`${rankProgress.meritsRemainingToNextLevel} merit${rankProgress.meritsRemainingToNextLevel === 1 ? '' : 's'} needed to next rank`
			].join('\n')
		: 'Max rank reached';

	return new EmbedBuilder()
		.setTitle(`Merits for ${targetDisplayName}`)
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
			},
			{
				name: 'Current Rank',
				value: currentRankLabel,
				inline: true
			},
			{
				name: 'Rank Progress',
				value: progressValue,
				inline: false
			}
		)
		.setDescription(description);
}

function buildEntriesDescription({ entries }: { entries: MeritSummaryEntry[] }) {
	if (entries.length === 0) {
		return 'No merit awards found.';
	}

	const maxDescriptionLength = 3_800;
	const chunks: string[] = [];
	let currentLength = 0;
	for (const entry of entries) {
		const timestamp = `<t:${Math.floor(entry.createdAt.getTime() / 1_000)}:f>`;
		const reason = trimForDisplay(entry.reason ?? 'No reason provided', 180);
		const event = entry.eventSession ? `${entry.eventSession.name}` : 'No linked event';
		const amountLabel = entry.amount >= 0 ? `+${entry.amount}` : `${entry.amount}`;
		const meritTypeName = trimForDisplay(entry.meritTypeName, 100);
		const awardedByName = trimForDisplay(entry.awardedByName, 100);
		const chunk = `**${amountLabel} merits** (${meritTypeName}) ${timestamp}\nAwarded by: ${awardedByName}\nEvent: ${trimForDisplay(event, 140)}\nReason: ${reason}`;

		const extraLength = chunks.length === 0 ? chunk.length : chunk.length + 2;
		if (currentLength + extraLength > maxDescriptionLength) {
			break;
		}

		chunks.push(chunk);
		currentLength += extraLength;
	}

	return chunks.join('\n\n');
}

function trimForDisplay(value: string, maxLength: number) {
	const trimmed = value.trim();
	if (trimmed.length <= maxLength) {
		return trimmed;
	}

	return `${trimmed.slice(0, Math.max(0, maxLength - 1))}...`;
}

function buildDisabledMeritListPageButtonId({
	targetDiscordUserId,
	page,
	direction
}: {
	targetDiscordUserId: string;
	page: number;
	direction: 'prev' | 'next';
}) {
	return `merit:list:page-disabled:${direction}:${targetDiscordUserId}:${page}`;
}
