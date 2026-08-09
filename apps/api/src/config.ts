import { z } from 'zod';
import { API_V1_ROUTES } from '@arbiter/api-contracts';

const ApiConfigSchema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	API_HOST: z.string().min(1).default('0.0.0.0'),
	API_PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
	API_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
	API_LOG_FILE_PATH: z.string().min(1).default('logs/api.log'),
	API_CONSOLE_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
	API_BODY_LIMIT_BYTES: z.coerce.number().int().min(1).max(1_048_576).default(65_536),
	API_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
	API_HEADERS_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
	API_KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(5_000),
	API_READINESS_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(2_000),
	API_DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(5_000),
	API_REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(5_000),
	API_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(10_000),
	API_DB_POOL_MAX: z.coerce.number().int().min(1).max(10).default(4),
	API_CREDENTIAL_PEPPER: z.string().min(32, 'API_CREDENTIAL_PEPPER must be at least 32 characters'),
	API_DISCORD_CLIENT_ID: z.string().regex(/^\d{17,20}$/, 'API_DISCORD_CLIENT_ID must be a Discord application ID'),
	API_DISCORD_CLIENT_SECRET: z.string().min(16, 'API_DISCORD_CLIENT_SECRET must be at least 16 characters'),
	API_DISCORD_CALLBACK_URL: z.url(),
	API_ALLOWED_ORIGINS: z.string().min(1),
	API_AUTH_REDIRECT_URLS: z.string().min(1),
	API_AUTH_STATE_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(600),
	API_SESSION_IDLE_TTL_SECONDS: z.coerce.number().int().min(300).max(3_600).default(1_800),
	API_SESSION_ABSOLUTE_TTL_SECONDS: z.coerce.number().int().min(900).max(86_400).default(28_800),
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	REDIS_HOST: z.string().min(1).default('127.0.0.1'),
	REDIS_PORT: z.coerce.number().int().min(1).max(65_535).default(6379),
	REDIS_PASSWORD: z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional()),
	REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
	API_REDIS_NAMESPACE: z
		.string()
		.min(1)
		.max(80)
		.regex(/^[a-z0-9:-]+$/)
		.default('arbiter:api:v1'),
	API_REDIS_MAX_TTL_SECONDS: z.coerce.number().int().min(1).max(86_400).default(3_600)
});

export type ApiConfig = {
	nodeEnv: z.infer<typeof ApiConfigSchema>['NODE_ENV'];
	host: string;
	port: number;
	logLevel: z.infer<typeof ApiConfigSchema>['API_LOG_LEVEL'];
	logFilePath: string;
	consoleLogLevel: z.infer<typeof ApiConfigSchema>['API_CONSOLE_LOG_LEVEL'];
	bodyLimitBytes: number;
	requestTimeoutMs: number;
	headersTimeoutMs: number;
	keepAliveTimeoutMs: number;
	readinessTimeoutMs: number;
	databaseConnectTimeoutMs: number;
	redisConnectTimeoutMs: number;
	shutdownTimeoutMs: number;
	databaseUrl: string;
	databasePoolMax: number;
	credentialPepper: string;
	auth: {
		discordClientId: string;
		discordClientSecret: string;
		discordCallbackUrl: string;
		allowedOrigins: readonly string[];
		allowedRedirectUrls: readonly string[];
		stateTtlSeconds: number;
		sessionIdleTtlSeconds: number;
		sessionAbsoluteTtlSeconds: number;
	};
	redis: {
		host: string;
		port: number;
		password?: string;
		db: number;
		namespace: string;
		maxTtlSeconds: number;
	};
};

export function parseApiConfig(input: NodeJS.ProcessEnv = process.env): ApiConfig {
	const parsed = ApiConfigSchema.safeParse(input);
	if (!parsed.success) {
		const message = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
		throw new Error(`Invalid API environment configuration: ${message}`);
	}

	const value = parsed.data;
	const allowedOrigins = parseUrlList('API_ALLOWED_ORIGINS', value.API_ALLOWED_ORIGINS, true, value.NODE_ENV);
	const allowedRedirectUrls = parseUrlList('API_AUTH_REDIRECT_URLS', value.API_AUTH_REDIRECT_URLS, false, value.NODE_ENV);
	const callbackUrl = parseExactUrl('API_DISCORD_CALLBACK_URL', value.API_DISCORD_CALLBACK_URL, value.NODE_ENV);
	if (callbackUrl.search || callbackUrl.hash)
		throw new Error('Invalid API environment configuration: API_DISCORD_CALLBACK_URL must not contain query or fragment');
	if (callbackUrl.pathname !== API_V1_ROUTES.authDiscordCallback) {
		throw new Error(`Invalid API environment configuration: API_DISCORD_CALLBACK_URL must use ${API_V1_ROUTES.authDiscordCallback}`);
	}
	if (allowedRedirectUrls.some((url) => !allowedOrigins.includes(new URL(url).origin))) {
		throw new Error('Invalid API environment configuration: every API_AUTH_REDIRECT_URLS origin must appear in API_ALLOWED_ORIGINS');
	}
	if (value.API_AUTH_STATE_TTL_SECONDS > value.API_REDIS_MAX_TTL_SECONDS || value.API_SESSION_IDLE_TTL_SECONDS > value.API_REDIS_MAX_TTL_SECONDS) {
		throw new Error('Invalid API environment configuration: auth state and idle session TTLs must not exceed API_REDIS_MAX_TTL_SECONDS');
	}
	if (value.API_SESSION_ABSOLUTE_TTL_SECONDS < value.API_SESSION_IDLE_TTL_SECONDS) {
		throw new Error('Invalid API environment configuration: API_SESSION_ABSOLUTE_TTL_SECONDS must be at least the idle TTL');
	}
	return {
		nodeEnv: value.NODE_ENV,
		host: value.API_HOST,
		port: value.API_PORT,
		logLevel: value.API_LOG_LEVEL,
		logFilePath: value.API_LOG_FILE_PATH,
		consoleLogLevel: value.API_CONSOLE_LOG_LEVEL,
		bodyLimitBytes: value.API_BODY_LIMIT_BYTES,
		requestTimeoutMs: value.API_REQUEST_TIMEOUT_MS,
		headersTimeoutMs: value.API_HEADERS_TIMEOUT_MS,
		keepAliveTimeoutMs: value.API_KEEP_ALIVE_TIMEOUT_MS,
		readinessTimeoutMs: value.API_READINESS_TIMEOUT_MS,
		databaseConnectTimeoutMs: value.API_DB_CONNECT_TIMEOUT_MS,
		redisConnectTimeoutMs: value.API_REDIS_CONNECT_TIMEOUT_MS,
		shutdownTimeoutMs: value.API_SHUTDOWN_TIMEOUT_MS,
		databaseUrl: value.DATABASE_URL,
		databasePoolMax: value.API_DB_POOL_MAX,
		credentialPepper: value.API_CREDENTIAL_PEPPER,
		auth: {
			discordClientId: value.API_DISCORD_CLIENT_ID,
			discordClientSecret: value.API_DISCORD_CLIENT_SECRET,
			discordCallbackUrl: callbackUrl.toString(),
			allowedOrigins,
			allowedRedirectUrls,
			stateTtlSeconds: value.API_AUTH_STATE_TTL_SECONDS,
			sessionIdleTtlSeconds: value.API_SESSION_IDLE_TTL_SECONDS,
			sessionAbsoluteTtlSeconds: value.API_SESSION_ABSOLUTE_TTL_SECONDS
		},
		redis: {
			host: value.REDIS_HOST,
			port: value.REDIS_PORT,
			password: value.REDIS_PASSWORD,
			db: value.REDIS_DB,
			namespace: value.API_REDIS_NAMESPACE,
			maxTtlSeconds: value.API_REDIS_MAX_TTL_SECONDS
		}
	};
}

function parseUrlList(field: string, rawValue: string, originsOnly: boolean, nodeEnv: ApiConfig['nodeEnv']): readonly string[] {
	const values = rawValue
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
	if (values.length === 0 || values.includes('*')) throw new Error(`Invalid API environment configuration: ${field} must contain exact URLs`);
	const normalized = values.map((value) => {
		const url = parseExactUrl(field, value, nodeEnv);
		if (originsOnly && (url.pathname !== '/' || url.search || url.hash)) {
			throw new Error(`Invalid API environment configuration: ${field} entries must be origins without paths, queries, or fragments`);
		}
		if (!originsOnly && url.hash) throw new Error(`Invalid API environment configuration: ${field} entries must not contain fragments`);
		return originsOnly ? url.origin : url.toString();
	});
	return [...new Set(normalized)];
}

function parseExactUrl(field: string, rawValue: string, nodeEnv: ApiConfig['nodeEnv']): URL {
	let url: URL;
	try {
		url = new URL(rawValue);
	} catch {
		throw new Error(`Invalid API environment configuration: ${field} must contain valid absolute URLs`);
	}
	if (url.username || url.password) throw new Error(`Invalid API environment configuration: ${field} must not contain credentials`);
	if (url.hostname.includes('*')) throw new Error(`Invalid API environment configuration: ${field} must not contain wildcard hosts`);
	const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && nodeEnv !== 'production';
	if (url.protocol !== 'https:' && !localHttp) {
		throw new Error(`Invalid API environment configuration: ${field} must use HTTPS (local HTTP is development/test only)`);
	}
	return url;
}
