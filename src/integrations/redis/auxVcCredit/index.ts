import { getRedisClient } from '../client';

const AUX_VC_CREDIT_KEY_PREFIX = 'arbiter:aux-vc-credit:';

export type AuxVcCreditRow = {
	discordUserId: string;
	userId: string | null;
	credits: number;
	eligibleAccumulatedMs: number;
	lastEvaluatedAtMs: number;
	createdAt: string;
	updatedAt: string;
};

type GetAuxVcCreditParams = {
	discordUserId: string;
};

type UpsertAuxVcCreditParams = {
	discordUserId: string;
	userId: string | null;
	credits: number;
	eligibleAccumulatedMs: number;
	lastEvaluatedAtMs: number;
};

type DeleteAuxVcCreditParams = {
	discordUserId: string;
};

export async function getAuxVcCredit({ discordUserId }: GetAuxVcCreditParams): Promise<AuxVcCreditRow | null> {
	const redis = getRedisClient();
	const key = getAuxVcCreditKey(discordUserId);
	const hash = await redis.hgetall(key);
	if (Object.keys(hash).length === 0) {
		return null;
	}

	return mapAuxVcCreditRow({
		discordUserId: extractDiscordUserIdFromKey(key),
		hash
	});
}

export async function listAuxVcCredits(): Promise<AuxVcCreditRow[]> {
	const redis = getRedisClient();
	const keys = await scanAuxVcCreditKeys();

	if (keys.length === 0) {
		return [];
	}

	const pipeline = redis.pipeline();
	for (const key of keys) {
		pipeline.hgetall(key);
	}

	const results = await pipeline.exec();
	if (!results) {
		return [];
	}

	const rows: AuxVcCreditRow[] = [];
	for (let index = 0; index < results.length; index++) {
		const [error, hash] = results[index];
		if (error) {
			throw error;
		}

		const safeHash = hash as Record<string, string>;
		if (Object.keys(safeHash).length === 0) {
			continue;
		}

		rows.push(
			mapAuxVcCreditRow({
				discordUserId: extractDiscordUserIdFromKey(keys[index]),
				hash: safeHash
			})
		);
	}

	return rows.sort((left, right) => left.discordUserId.localeCompare(right.discordUserId));
}

export async function upsertAuxVcCredit({ discordUserId, userId, credits, eligibleAccumulatedMs, lastEvaluatedAtMs }: UpsertAuxVcCreditParams) {
	const redis = getRedisClient();
	const key = getAuxVcCreditKey(discordUserId);
	const now = new Date().toISOString();

	const tx = redis.multi();
	tx.hset(key, {
		discordUserId,
		credits: String(credits),
		eligibleAccumulatedMs: String(eligibleAccumulatedMs),
		lastEvaluatedAtMs: String(lastEvaluatedAtMs),
		updatedAt: now
	});
	tx.hsetnx(key, 'createdAt', now);

	if (userId === null) {
		tx.hdel(key, 'userId');
	} else {
		tx.hset(key, 'userId', userId);
	}

	await tx.exec();
}

export async function deleteAuxVcCredit({ discordUserId }: DeleteAuxVcCreditParams) {
	const redis = getRedisClient();
	await redis.del(getAuxVcCreditKey(discordUserId));
}

function getAuxVcCreditKey(discordUserId: string) {
	return `${AUX_VC_CREDIT_KEY_PREFIX}${discordUserId}`;
}

function extractDiscordUserIdFromKey(key: string) {
	return key.slice(AUX_VC_CREDIT_KEY_PREFIX.length);
}

async function scanAuxVcCreditKeys() {
	const redis = getRedisClient();
	const keys: string[] = [];
	let cursor = '0';

	do {
		const [nextCursor, pageKeys] = await redis.scan(cursor, 'MATCH', `${AUX_VC_CREDIT_KEY_PREFIX}*`, 'COUNT', '200');
		cursor = nextCursor;
		keys.push(...pageKeys);
	} while (cursor !== '0');

	return keys;
}

function mapAuxVcCreditRow({ discordUserId, hash }: { discordUserId: string; hash: Record<string, string> }): AuxVcCreditRow {
	return {
		discordUserId: hash.discordUserId ?? discordUserId,
		userId: hash.userId ?? null,
		credits: parseIntegerField(hash.credits, 'credits', discordUserId),
		eligibleAccumulatedMs: parseIntegerField(hash.eligibleAccumulatedMs, 'eligibleAccumulatedMs', discordUserId),
		lastEvaluatedAtMs: parseIntegerField(hash.lastEvaluatedAtMs, 'lastEvaluatedAtMs', discordUserId),
		createdAt: hash.createdAt ?? new Date(0).toISOString(),
		updatedAt: hash.updatedAt ?? hash.createdAt ?? new Date(0).toISOString()
	};
}

function parseIntegerField(rawValue: string | undefined, field: string, discordUserId: string): number {
	if (!rawValue) {
		throw new Error(`Invalid AUX VC credit hash: missing ${field} for discordUserId=${discordUserId}`);
	}

	const parsed = Number.parseInt(rawValue, 10);
	if (Number.isNaN(parsed)) {
		throw new Error(`Invalid AUX VC credit hash: non-integer ${field} for discordUserId=${discordUserId}`);
	}

	return parsed;
}
