import { readFile } from 'node:fs/promises';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { redactConnectionString, requiredEnv } from './env';
import { seedDivisionMemberships } from './seedDivisionMemberships';

type GuildUserRecord = {
	discordUserId: string;
	discordUsername: string;
	discordNickname: string;
	discordAvatarUrl: string;
	parsedDivisionPrefixes?: string[];
	fetchedAt?: string;
};

const TARGET_DATABASE_URL = requiredEnv(['MIGRATION_TARGET_DATABASE_URL', 'DATABASE_URL']);
const SOURCE_DATABASE_URL = requiredEnv('MIGRATION_SOURCE_DATABASE_URL');
const INPUT_PATH = 'data/discord-guild-users.json';
const DRY_RUN = false;
const FAIL_FAST = true;
const LIMIT: number | undefined = undefined;
const ONLY_DISCORD_USER_IDS = new Set<string>([]);

function isGuildUserRecord(value: unknown): value is GuildUserRecord {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const candidate = value as Record<string, unknown>;
	const parsedDivisionPrefixesValid =
		candidate.parsedDivisionPrefixes === undefined ||
		(Array.isArray(candidate.parsedDivisionPrefixes) && candidate.parsedDivisionPrefixes.every((prefix) => typeof prefix === 'string'));

	return (
		typeof candidate.discordUserId === 'string' &&
		typeof candidate.discordUsername === 'string' &&
		typeof candidate.discordNickname === 'string' &&
		typeof candidate.discordAvatarUrl === 'string' &&
		parsedDivisionPrefixesValid
	);
}

async function readCache(): Promise<GuildUserRecord[]> {
	const raw = await readFile(INPUT_PATH, 'utf8');
	const parsed = JSON.parse(raw) as Record<string, unknown>;

	const users: GuildUserRecord[] = [];
	for (const value of Object.values(parsed)) {
		if (isGuildUserRecord(value)) {
			users.push(value);
		}
	}

	return users;
}

async function seedUser(prisma: PrismaClient, user: GuildUserRecord): Promise<'created' | 'updated'> {
	const existing = await prisma.user.findUnique({
		where: { discordUserId: user.discordUserId },
		select: { id: true }
	});

	if (existing) {
		if (!DRY_RUN) {
			await prisma.user.update({
				where: { discordUserId: user.discordUserId },
				data: {
					discordUsername: user.discordUsername,
					discordNickname: user.discordNickname,
					discordAvatarUrl: user.discordAvatarUrl
				}
			});
		}
		return 'updated';
	}

	if (!DRY_RUN) {
		await prisma.user.create({
			data: {
				discordUserId: user.discordUserId,
				discordUsername: user.discordUsername,
				discordNickname: user.discordNickname,
				discordAvatarUrl: user.discordAvatarUrl
			}
		});
	}

	return 'created';
}

async function main() {
	console.log(`Input path: ${INPUT_PATH}`);
	console.log(`Source DB: ${redactConnectionString(SOURCE_DATABASE_URL)}`);
	console.log(`Target DB: ${redactConnectionString(TARGET_DATABASE_URL)}`);
	console.log(`Dry run: ${DRY_RUN ? 'yes' : 'no'}`);

	const cachedUsers = await readCache();
	let users = cachedUsers;
	if (ONLY_DISCORD_USER_IDS.size > 0) {
		users = users.filter((user) => ONLY_DISCORD_USER_IDS.has(user.discordUserId));
	}
	if (typeof LIMIT === 'number') {
		users = users.slice(0, LIMIT);
	}

	console.log(`Loaded ${users.length} users from cache`);

	const targetPool = new Pool({ connectionString: TARGET_DATABASE_URL });
	const prisma = new PrismaClient({
		adapter: new PrismaPg(targetPool)
	});

	try {
		const stats = {
			totalUsers: users.length,
			created: 0,
			updated: 0,
			wouldCreate: 0,
			wouldUpdate: 0,
			divisionMembershipUsersProcessed: 0,
			divisionMembershipRowsTargeted: 0,
			auxOnlyUsers: 0,
			staffUsers: 0,
			lgnFallbackUsers: 0,
			usersWithUnknownPrefixes: 0,
			failed: 0
		};

		for (const user of users) {
			try {
				const result = await seedUser(prisma, user);
				if (result === 'created') {
					if (DRY_RUN) {
						stats.wouldCreate += 1;
						console.log(`Would create ${user.discordUserId}`);
					} else {
						stats.created += 1;
					}
					continue;
				}

				if (DRY_RUN) {
					stats.wouldUpdate += 1;
					console.log(`Would update ${user.discordUserId}`);
				} else {
					stats.updated += 1;
				}
			} catch (error) {
				stats.failed += 1;
				console.error(`Failed seeding user ${user.discordUserId}`, error);
				if (FAIL_FAST) {
					throw error;
				}
			}
		}

		const userIdsByDiscordId = new Map(
			(
				await prisma.user.findMany({
					where: {
						discordUserId: {
							in: users.map((user) => user.discordUserId)
						}
					},
					select: {
						id: true,
						discordUserId: true
					}
				})
			).map((user) => [user.discordUserId, user.id])
		);
		const divisionMembershipUsers = users
			.map((user) => {
				const userId = userIdsByDiscordId.get(user.discordUserId);
				if (!userId) {
					return null;
				}

				return {
					userId,
					discordUserId: user.discordUserId,
					parsedDivisionPrefixes: user.parsedDivisionPrefixes ?? []
				};
			})
			.filter((value): value is { userId: string; discordUserId: string; parsedDivisionPrefixes: string[] } => value !== null);

		const divisionStats = await seedDivisionMemberships({
			prisma,
			users: divisionMembershipUsers,
			dryRun: DRY_RUN,
			sourceDatabaseUrl: SOURCE_DATABASE_URL
		});
		stats.divisionMembershipUsersProcessed = divisionStats.totalUsers;
		stats.divisionMembershipRowsTargeted = divisionStats.targetMembershipRows;
		stats.auxOnlyUsers = divisionStats.auxOnlyUsers;
		stats.staffUsers = divisionStats.staffUsers;
		stats.lgnFallbackUsers = divisionStats.lgnFallbackUsers;
		stats.usersWithUnknownPrefixes = divisionStats.usersWithUnknownPrefixes;

		console.log('Guild user seeding finished');
		console.table(stats);
	} finally {
		await prisma.$disconnect();
		await targetPool.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
