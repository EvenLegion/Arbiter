import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { Client, GatewayIntentBits, type GuildMember } from 'discord.js';
import { requiredEnv } from './env';

type GuildUserRecord = {
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
	discordAvatarUrl: string;
	parsedDivisionPrefixes: string[];
	fetchedAt: string;
};

const OLD_BOT_TOKEN = requiredEnv(['MIGRATION_DISCORD_BOT_TOKEN', 'DISCORD_TOKEN']);
const DISCORD_GUILD_ID = requiredEnv(['MIGRATION_DISCORD_GUILD_ID', 'DISCORD_GUILD_ID']);
const OUTPUT_PATH = 'data/discord-guild-users.json';

const LIMIT: number | undefined = undefined;
const ONLY_DISCORD_USER_IDS = new Set<string>([]);
const KNOWN_DIVISION_PREFIXES = new Set<string>([
	'LGN',
	'INT',
	'RES',
	'ANG',
	'CENT',
	'AMB',
	'EXEC',
	'ADMR',
	'CMDR',
	'PRA',
	'SEC',
	'TECH',
	'CMD',
	'QRM',
	'TIR',
	'NVY-L',
	'MRN-L',
	'SUP-L',
	'NVY',
	'MRN',
	'SUP',
	'HLO',
	'VNG',
	'HVK',
	'RPR',
	'DRL',
	'SCR',
	'LOG',
	'TRD',
	'ARC',
	'AUX',
	'RFT',
	'SPR',
	'TRA',
	'HL-L',
	'HV-L',
	'HLO ◇',
	'CMD ★',
	'CMD★'
]);
const CIRCLED_NUMBER_START_1 = '①'.codePointAt(0) ?? 0;
const CIRCLED_NUMBER_END_20 = '⑳'.codePointAt(0) ?? 0;
const CIRCLED_NUMBER_START_21 = '㉑'.codePointAt(0) ?? 0;
const CIRCLED_NUMBER_END_35 = '㉟'.codePointAt(0) ?? 0;
const CIRCLED_NUMBER_START_36 = '㊱'.codePointAt(0) ?? 0;
const CIRCLED_NUMBER_END_50 = '㊿'.codePointAt(0) ?? 0;

type ParsedDisplayName = {
	nickname: string;
	divisionPrefixes: string[];
};

function normalizeDivisionPrefix(value: string): string {
	const normalized = value.replace(/\s+/g, ' ').trim().toUpperCase();

	if (normalized.length === 0) {
		return normalized;
	}

	// Track symbols can appear on legacy prefixes (for example: "HLO ◇ |").
	const withoutTrackSymbols = normalized.replace(/[◇⬖◆]/g, '').replace(/\s+/g, ' ').trim();

	return withoutTrackSymbols.length > 0 ? withoutTrackSymbols : normalized;
}

function parseCircledMeritRankLevel(value: string): number | null {
	if (value.length !== 1) {
		return null;
	}

	const codePoint = value.codePointAt(0);
	if (!codePoint) {
		return null;
	}

	if (codePoint >= CIRCLED_NUMBER_START_1 && codePoint <= CIRCLED_NUMBER_END_20) {
		return codePoint - CIRCLED_NUMBER_START_1 + 1;
	}
	if (codePoint >= CIRCLED_NUMBER_START_21 && codePoint <= CIRCLED_NUMBER_END_35) {
		return codePoint - CIRCLED_NUMBER_START_21 + 21;
	}
	if (codePoint >= CIRCLED_NUMBER_START_36 && codePoint <= CIRCLED_NUMBER_END_50) {
		return codePoint - CIRCLED_NUMBER_START_36 + 36;
	}

	return null;
}

function isKnownDivisionPrefix(prefix: string): boolean {
	if (KNOWN_DIVISION_PREFIXES.has(prefix)) {
		return true;
	}

	// Legacy staff prefixes can include suffixes like CMD-HL.
	return prefix.includes('CMD');
}

function parseDisplayName(rawDisplayName: string, fallbackNickname: string): ParsedDisplayName {
	const trimmed = rawDisplayName.trim();
	if (trimmed.length === 0) {
		return {
			nickname: fallbackNickname,
			divisionPrefixes: []
		};
	}

	const segments = trimmed
		.split('|')
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);

	const divisionPrefixes: string[] = [];
	let nameStartIndex = 0;
	while (nameStartIndex < segments.length - 1) {
		const parsedPrefix = normalizeDivisionPrefix(segments[nameStartIndex] ?? '');
		if (!isKnownDivisionPrefix(parsedPrefix)) {
			break;
		}

		if (!divisionPrefixes.includes(parsedPrefix)) {
			divisionPrefixes.push(parsedPrefix);
		}
		nameStartIndex += 1;
	}

	let workingName = segments.slice(nameStartIndex).join(' | ').trim();
	if (workingName.length === 0) {
		workingName = fallbackNickname;
	}

	const tokens = workingName.split(/\s+/).filter((token) => token.length > 0);
	if (tokens.length > 1) {
		const trailingToken = tokens[tokens.length - 1] ?? '';
		const parsedMeritRankLevel = parseCircledMeritRankLevel(trailingToken);
		if (parsedMeritRankLevel !== null) {
			tokens.pop();
			workingName = tokens.join(' ').trim();
		}
	}

	return {
		nickname: workingName.length > 0 ? workingName : fallbackNickname,
		divisionPrefixes
	};
}

function toGuildUserRecord(member: GuildMember, fetchedAt: string): GuildUserRecord {
	const fallbackNickname = member.user.globalName ?? member.user.username;
	const rawDisplayName = member.nickname ?? fallbackNickname;
	const parsedDisplayName = parseDisplayName(rawDisplayName, fallbackNickname);

	return {
		discordUserId: member.user.id,
		discordUsername: member.user.username,
		discordNickname: parsedDisplayName.nickname,
		discordAvatarUrl: member.user.displayAvatarURL(),
		parsedDivisionPrefixes: parsedDisplayName.divisionPrefixes,
		fetchedAt
	};
}

async function writeCache(records: GuildUserRecord[]): Promise<void> {
	const byId: Record<string, GuildUserRecord> = {};
	for (const record of records) {
		byId[record.discordUserId] = record;
	}

	await mkdir(dirname(OUTPUT_PATH), { recursive: true });
	await writeFile(OUTPUT_PATH, `${JSON.stringify(byId, null, 2)}\n`, 'utf8');
	console.log(`Wrote ${records.length} guild users to ${OUTPUT_PATH}`);
}

async function main() {
	console.log(`Discord guild id: ${DISCORD_GUILD_ID}`);
	console.log(`Output path: ${OUTPUT_PATH}`);

	const client = new Client({
		intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
	});

	try {
		await client.login(OLD_BOT_TOKEN);
		const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
		const members = await guild.members.fetch();

		let selectedMembers = [...members.values()].filter((member) => !member.user.bot);
		if (ONLY_DISCORD_USER_IDS.size > 0) {
			selectedMembers = selectedMembers.filter((member) => ONLY_DISCORD_USER_IDS.has(member.user.id));
		}
		if (typeof LIMIT === 'number') {
			selectedMembers = selectedMembers.slice(0, LIMIT);
		}

		const fetchedAt = new Date().toISOString();
		const records = selectedMembers.map((member) => toGuildUserRecord(member, fetchedAt));
		await writeCache(records);
	} finally {
		client.destroy();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
