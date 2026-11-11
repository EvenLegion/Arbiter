import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

import type { MeritRankBreakdownEntry, MeritRankBreakdownLadder } from '../../../../integrations/prisma/repositories';
import { getMeritBadgeTier } from '../../../services/merit-rank/meritBadge';
import { buildMeritRankListPageButtonId, buildMeritRankListPageIndicatorButtonId } from './meritRankListButtonCustomId';

/** Legacy ladder: 10 levels per page (5 pages). */
export const MERIT_RANK_LIST_PAGE_SIZE = 10;
/** Badge ladder: 9 tiers per page, so each page is 3 badge levels (4 pages). */
export const MERIT_BADGE_LIST_PAGE_SIZE = 9;
type MeritRankBreakdownColumnKey = Extract<keyof Omit<MeritRankBreakdownEntry, 'level'>, string>;

const COLUMN_GROUPS: ReadonlyArray<{
	name: string;
	columns: ReadonlyArray<{
		key: MeritRankBreakdownColumnKey;
		label: string;
	}>;
}> = [
	{
		name: 'Legion / Reserve',
		columns: [
			{ key: 'lgnOrResCount', label: 'LGN/RES' },
			{ key: 'lgnCount', label: 'LGN' },
			{ key: 'resCount', label: 'RES' }
		]
	},
	{
		name: 'Command',
		columns: [
			{ key: 'centCount', label: 'CENT' },
			{ key: 'optCount', label: 'OPT' }
		]
	},
	{
		name: 'Divisions',
		columns: [
			{ key: 'nvyCount', label: 'NVY' },
			{ key: 'nvyLCount', label: 'NVY-L' },
			{ key: 'mrnCount', label: 'MRN' },
			{ key: 'mrnLCount', label: 'MRN-L' },
			{ key: 'supCount', label: 'SUP' },
			{ key: 'supLCount', label: 'SUP-L' }
		]
	}
];

export function buildMeritRankListPayload({
	entries,
	page,
	ladder = 'legacy',
	pageSize = ladder === 'badge' ? MERIT_BADGE_LIST_PAGE_SIZE : MERIT_RANK_LIST_PAGE_SIZE
}: {
	entries: MeritRankBreakdownEntry[];
	page: number;
	ladder?: MeritRankBreakdownLadder;
	pageSize?: number;
}) {
	const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
	const resolvedPage = Math.min(Math.max(1, page), totalPages);
	const pagedEntries = entries.slice((resolvedPage - 1) * pageSize, resolvedPage * pageSize);
	const prevPage = Math.max(1, resolvedPage - 1);
	const nextPage = Math.min(totalPages, resolvedPage + 1);
	const prevDisabled = resolvedPage <= 1;
	const nextDisabled = resolvedPage >= totalPages;
	const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(
				prevDisabled
					? buildDisabledMeritRankListPageButtonId({
							page: resolvedPage,
							direction: 'prev'
						})
					: buildMeritRankListPageButtonId({ page: prevPage })
			)
			.setLabel('Prev')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(prevDisabled),
		new ButtonBuilder()
			.setCustomId(buildMeritRankListPageIndicatorButtonId({ page: resolvedPage }))
			.setLabel(`Page ${resolvedPage}/${totalPages}`)
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
		new ButtonBuilder()
			.setCustomId(
				nextDisabled
					? buildDisabledMeritRankListPageButtonId({
							page: resolvedPage,
							direction: 'next'
						})
					: buildMeritRankListPageButtonId({ page: nextPage })
			)
			.setLabel('Next')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(nextDisabled)
	);

	return {
		embeds: [
			buildRankEmbed({
				entries: pagedEntries,
				page: resolvedPage,
				totalPages,
				ladder
			})
		],
		components: [controls]
	};
}

function buildRankEmbed({
	entries,
	page,
	totalPages,
	ladder
}: {
	entries: MeritRankBreakdownEntry[];
	page: number;
	totalPages: number;
	ladder: MeritRankBreakdownLadder;
}) {
	const firstRow = entries[0]?.level ?? 1;
	const lastRow = entries[entries.length - 1]?.level ?? firstRow;
	const rowLabel = ladder === 'badge' ? ROW_LABELS.badge : ROW_LABELS.legacy;
	const title =
		ladder === 'badge'
			? `Merit Badge List (${formatBadgeLevelName(firstRow)}-${formatBadgeLevelName(lastRow)})`
			: `Merit Rank List (${firstRow}-${lastRow})`;

	return new EmbedBuilder()
		.setTitle(title)
		.setColor(0x2563eb)
		.setDescription('Counts are based on current merit totals and DB division memberships.')
		.setFooter({ text: `Page ${page}/${totalPages}` })
		.addFields(
			COLUMN_GROUPS.map((group) => ({
				name: group.name,
				value: ['```text', buildTable(entries, group.columns, rowLabel), '```'].join('\n'),
				inline: false
			}))
		);
}

type RowLabel = {
	header: string;
	format: (row: number) => string;
	align: 'start' | 'end';
};

const ROW_LABELS: Record<MeritRankBreakdownLadder, RowLabel> = {
	legacy: { header: 'Lvl', format: (row) => String(row), align: 'start' },
	badge: { header: 'Badge', format: (row) => getMeritBadgeTier(row)?.label ?? String(row), align: 'end' }
};

function formatBadgeLevelName(tier: number) {
	return getMeritBadgeTier(tier)?.levelName ?? String(tier);
}

function buildTable(
	entries: MeritRankBreakdownEntry[],
	columns: ReadonlyArray<{
		key: MeritRankBreakdownColumnKey;
		label: string;
	}>,
	rowLabel: RowLabel
) {
	const labels = entries.map((entry) => rowLabel.format(entry.level));
	const labelWidth = Math.max(rowLabel.header.length, ...labels.map((label) => label.length));
	const padLabel = (label: string) => (rowLabel.align === 'start' ? label.padStart(labelWidth) : label.padEnd(labelWidth));
	const columnWidths = new Map<MeritRankBreakdownColumnKey, number>(
		columns.map(({ key, label }) => [key, Math.max(label.length, ...entries.map((entry) => String(entry[key]).length))])
	);

	const header = [padLabel(rowLabel.header), ...columns.map(({ key, label }) => label.padStart(columnWidths.get(key)!))].join(' ');
	const rows = entries.map((entry, index) =>
		[padLabel(labels[index]), ...columns.map(({ key }) => String(entry[key]).padStart(columnWidths.get(key)!))].join(' ')
	);

	return [header, ...rows].join('\n');
}
function buildDisabledMeritRankListPageButtonId({ page, direction }: { page: number; direction: 'prev' | 'next' }) {
	return `merit:rank-list:page-disabled:${direction}:${page}`;
}
