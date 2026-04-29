import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

import type { MeritRankBreakdownEntry } from '../../../../integrations/prisma/repositories';
import { buildMeritRankListPageButtonId, buildMeritRankListPageIndicatorButtonId } from './meritRankListButtonCustomId';

export const MERIT_RANK_LIST_PAGE_SIZE = 10;
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
	pageSize = MERIT_RANK_LIST_PAGE_SIZE
}: {
	entries: MeritRankBreakdownEntry[];
	page: number;
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
				totalPages
			})
		],
		components: [controls]
	};
}

function buildRankEmbed({ entries, page, totalPages }: { entries: MeritRankBreakdownEntry[]; page: number; totalPages: number }) {
	const startLevel = entries[0]?.level ?? 1;
	const endLevel = entries[entries.length - 1]?.level ?? startLevel;

	return new EmbedBuilder()
		.setTitle(`Merit Rank List (${startLevel}-${endLevel})`)
		.setColor(0x2563eb)
		.setDescription('Counts are based on current merit totals and DB division memberships.')
		.setFooter({ text: `Page ${page}/${totalPages}` })
		.addFields(
			COLUMN_GROUPS.map((group) => ({
				name: group.name,
				value: ['```text', buildTable(entries, group.columns), '```'].join('\n'),
				inline: false
			}))
		);
}

function buildTable(
	entries: MeritRankBreakdownEntry[],
	columns: ReadonlyArray<{
		key: MeritRankBreakdownColumnKey;
		label: string;
	}>
) {
	const levelWidth = Math.max('Lvl'.length, String(entries[entries.length - 1]?.level ?? 1).length);
	const columnWidths = new Map<MeritRankBreakdownColumnKey, number>(
		columns.map(({ key, label }) => [key, Math.max(label.length, ...entries.map((entry) => String(entry[key]).length))])
	);

	const header = ['Lvl'.padStart(levelWidth), ...columns.map(({ key, label }) => label.padStart(columnWidths.get(key)!))].join(' ');
	const rows = entries.map((entry) =>
		[String(entry.level).padStart(levelWidth), ...columns.map(({ key }) => String(entry[key]).padStart(columnWidths.get(key)!))].join(' ')
	);

	return [header, ...rows].join('\n');
}
function buildDisabledMeritRankListPageButtonId({ page, direction }: { page: number; direction: 'prev' | 'next' }) {
	return `merit:rank-list:page-disabled:${direction}:${page}`;
}
