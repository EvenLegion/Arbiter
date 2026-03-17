import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

const POSTGRES_TEST_IMAGE = process.env.POSTGRES_DOCKER_VERSION ?? 'postgres:17-alpine';
const REDIS_TEST_IMAGE = process.env.REDIS_DOCKER_VERSION ?? 'redis:7-alpine';
const DISCORD_TEST_ENV = {
	DISCORD_TOKEN: 'test-discord-token',
	DISCORD_GUILD_ID: 'test-guild-id',
	WELCOME_CHANNEL_ID: 'welcome-channel-id',
	WELCOME_RULES_CHANNEL_ID: 'welcome-rules-channel-id',
	WELCOME_RECRUITMENT_CHANNEL_ID: 'welcome-recruitment-channel-id',
	WELCOME_ROLE_SELECT_CHANNEL_ID: 'welcome-role-select-channel-id',
	WELCOME_CHARTER_CHANNEL_ID: 'welcome-charter-channel-id',
	WELCOME_NEW_PLAYERS_CHANNEL_ID: 'welcome-new-players-channel-id',
	BOT_REQUESTS_CHANNEL_ID: 'bot-requests-channel-id',
	EXEC_ROLE_ID: 'exec-role-id',
	SEC_ROLE_ID: 'sec-role-id',
	TECH_ROLE_ID: 'tech-role-id',
	CMD_ROLE_ID: 'cmd-role-id',
	TIR_ROLE_ID: 'tir-role-id',
	ANG_ROLE_ID: 'ang-role-id',
	CENT_ROLE_ID: 'cent-role-id',
	NVY_L_ROLE_ID: 'nvy-l-role-id',
	MRN_L_ROLE_ID: 'mrn-l-role-id',
	SUP_L_ROLE_ID: 'sup-l-role-id',
	NVY_ROLE_ID: 'nvy-role-id',
	MRN_ROLE_ID: 'mrn-role-id',
	SUP_ROLE_ID: 'sup-role-id',
	LGN_ROLE_ID: 'lgn-role-id',
	INT_ROLE_ID: 'int-role-id',
	RES_ROLE_ID: 'res-role-id',
	EVENT_TRACKING_CHANNEL_ID: 'event-tracking-channel-id',
	EVENT_TRACKING_INTERVAL_SECONDS: '15',
	EVENT_MERIT_DEFAULT_MIN_ATTENDANCE_PCT: '50'
} as const;

export type IntegrationContainers = {
	postgres: StartedPostgreSqlContainer;
	redis: StartedRedisContainer;
	databaseUrl: string;
	redisUrl: string;
};

export async function startPostgresTestContainer() {
	const postgres = await new PostgreSqlContainer(POSTGRES_TEST_IMAGE)
		.withDatabase('arbiter_test')
		.withUsername('arbiter')
		.withPassword('arbiter')
		.start();
	return {
		postgres,
		databaseUrl: postgres.getConnectionUri()
	};
}

export async function startRedisTestContainer() {
	const redis = await new RedisContainer(REDIS_TEST_IMAGE).withPassword('arbiter').start();
	return {
		redis,
		redisUrl: redis.getConnectionUrl()
	};
}

export async function startIntegrationContainers(): Promise<IntegrationContainers> {
	const { postgres, databaseUrl } = await startPostgresTestContainer();
	const { redis, redisUrl } = await startRedisTestContainer();

	return {
		postgres,
		redis,
		databaseUrl,
		redisUrl
	};
}

export async function stopPostgresTestContainer(container: StartedPostgreSqlContainer) {
	await container.stop();
}

export async function stopRedisTestContainer(container: StartedRedisContainer) {
	await container.stop();
}

export async function stopIntegrationContainers(containers: IntegrationContainers) {
	await stopRedisTestContainer(containers.redis);
	await stopPostgresTestContainer(containers.postgres);
}

export function applyDatabaseTestEnv(databaseUrl: string) {
	process.env.NODE_ENV = 'development';
	process.env.FILE_LOG_LEVEL = 'error';
	process.env.LOG_FILE_PATH = 'logs/test.log';
	process.env.CONSOLE_LOG_LEVEL = 'silent';
	process.env.ENABLE_CONSOLE_PRETTY_LOGS = 'false';
	process.env.DATABASE_URL = databaseUrl;
}

export function applyRedisTestEnv(redisUrl: string) {
	const parsedRedisUrl = new URL(redisUrl);
	process.env.NODE_ENV = 'development';
	process.env.FILE_LOG_LEVEL = 'error';
	process.env.LOG_FILE_PATH = 'logs/test.log';
	process.env.CONSOLE_LOG_LEVEL = 'silent';
	process.env.ENABLE_CONSOLE_PRETTY_LOGS = 'false';
	process.env.REDIS_HOST = parsedRedisUrl.hostname;
	process.env.REDIS_PORT = parsedRedisUrl.port;
	process.env.REDIS_PASSWORD = decodeURIComponent(parsedRedisUrl.password);
	process.env.REDIS_DB = '0';
}

export function applyIntegrationTestEnv(containers: IntegrationContainers) {
	applyDatabaseTestEnv(containers.databaseUrl);
	applyRedisTestEnv(containers.redisUrl);
}

export function applyDiscordTestEnv(overrides: Partial<Record<keyof typeof DISCORD_TEST_ENV, string>> = {}) {
	process.env.NODE_ENV = 'development';
	process.env.FILE_LOG_LEVEL = 'error';
	process.env.LOG_FILE_PATH = 'logs/test.log';
	process.env.CONSOLE_LOG_LEVEL = 'silent';
	process.env.ENABLE_CONSOLE_PRETTY_LOGS = 'false';

	for (const [key, value] of Object.entries(DISCORD_TEST_ENV)) {
		process.env[key] = overrides[key as keyof typeof DISCORD_TEST_ENV] ?? value;
	}
}
