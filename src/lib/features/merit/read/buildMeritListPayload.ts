import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

import { ENV_MERIT_BADGE_ROLES } from '../../../../config/env/discord';
import type { MeritSummaryEntry } from '../../../../integrations/prisma/repositories';
import { buildMeritBadgeListFields, resolveMeritBadgeCopyProgress, type MeritBadgeCopyRoles } from '../../../services/merit-rank/meritBadgeMessages';
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
	/** Defaults to the configured badge roles. */
	badgeRoles?: MeritBadgeCopyRoles;
};

export function buildMeritListPayload({
	targetDiscordUserId,
	targetDisplayName,
	totalMerits,
	totalLinkedEvents,
	page,
	totalPages,
	entries,
	badgeRoles = ENV_MERIT_BADGE_ROLES
}: BuildMeritListPayloadParams) {
	const embed = buildMeritListEmbed({
		targetDisplayName,
		totalMerits,
		totalLinkedEvents,
		entries,
		badgeRoles
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
	entries,
	badgeRoles
}: {
	targetDisplayName: string;
	totalMerits: number;
	totalLinkedEvents: number;
	entries: MeritSummaryEntry[];
	badgeRoles: MeritBadgeCopyRoles;
}) {
	const description = buildEntriesDescription({
		entries
	});
	const standing = buildStandingFields({ totalMerits, badgeRoles });

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
				name: standing.currentName,
				value: standing.currentValue,
				inline: true
			},
			{
				name: standing.progressName,
				value: standing.progressValue,
				inline: false
			}
		)
		.setDescription(description);
}

/** Badge fields once the member's badge tier has a role; otherwise the legacy rank fields. */
function buildStandingFields({ totalMerits, badgeRoles }: { totalMerits: number; badgeRoles: MeritBadgeCopyRoles }) {
	const badgeProgress = resolveMeritBadgeCopyProgress({
		totalMerits,
		badgeRoles
	});
	if (badgeProgress) {
		return {
			currentName: 'Current Badge',
			progressName: 'Badge Progress',
			...buildMeritBadgeListFields(badgeProgress)
		};
	}

	const rankProgress = resolveMeritRankProgress(totalMerits);
	return {
		currentName: 'Current Rank',
		currentValue: rankProgress.currentLevel ? `Level ${rankProgress.currentLevel}` : 'Unranked',
		progressName: 'Rank Progress',
		progressValue: rankProgress.nextLevel
			? [
					`To Level ${rankProgress.nextLevel}: ${buildMeritRankProgressBar({ progressRatio: rankProgress.progressRatio })} ${rankProgress.progressPercent}%`,
					`${rankProgress.meritsRemainingToNextLevel} merit${rankProgress.meritsRemainingToNextLevel === 1 ? '' : 's'} needed to next rank`
				].join('\n')
			: 'Max rank reached'
	};
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
