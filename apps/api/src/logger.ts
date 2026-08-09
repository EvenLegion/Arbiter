import { isAbsolute, resolve } from 'node:path';

import pino, { type DestinationStream, type Logger, type TransportMultiOptions } from 'pino';

import type { ApiConfig } from './config';

type ApiLogLevel = ApiConfig['logLevel'];
type TransportTarget = NonNullable<TransportMultiOptions['targets']>[number];

export function createApiLogger(
	config: Pick<ApiConfig, 'consoleLogLevel' | 'logFilePath' | 'logLevel' | 'nodeEnv'>,
	destination?: DestinationStream
): Logger {
	const options = {
		level: destination ? config.logLevel : resolveLowestLogLevel([config.logLevel, config.consoleLogLevel]),
		base: {
			app: 'arbiter',
			service: 'arbiter-api',
			environment: config.nodeEnv
		},
		redact: {
			paths: [
				'authorization',
				'cookie',
				'headers.authorization',
				'headers.cookie',
				'headers.x-csrf-token',
				'headers.set-cookie',
				'req.headers.authorization',
				'req.headers.cookie',
				'req.headers.x-csrf-token',
				'req.headers.set-cookie',
				'config.databaseUrl',
				'config.credentialPepper',
				'config.auth.discordClientSecret',
				'config.API_CREDENTIAL_PEPPER',
				'config.API_DISCORD_CLIENT_SECRET',
				'config.redis.password',
				'credential.secret',
				'credential.verifier',
				'credentials[*].verifier',
				'credentialPepper',
				'API_CREDENTIAL_PEPPER',
				'digest',
				'mintResult.secret',
				'result.secret',
				'result.value.secret',
				'*.secret',
				'*.verifier',
				'*.*.secret',
				'*.*.verifier',
				'verifier',
				'password',
				'secret',
				'token',
				'access_token',
				'refresh_token',
				'csrfToken',
				'sessionId',
				'bindingId',
				'oauthCode',
				'oauthState',
				'*.access_token',
				'*.refresh_token',
				'*.csrfToken',
				'*.sessionId',
				'*.bindingId',
				'*.oauthCode',
				'*.oauthState'
			],
			censor: '[REDACTED]'
		}
	};

	if (destination) return pino(options, destination);

	const targets: TransportTarget[] = [
		{
			target: 'pino/file',
			level: config.logLevel,
			options: {
				destination: resolveApiLogFilePath(config.logFilePath),
				mkdir: true
			}
		}
	];
	if (config.consoleLogLevel !== 'silent') {
		targets.push({
			target: 'pino/file',
			level: config.consoleLogLevel,
			options: { destination: 1 }
		});
	}

	return pino({ ...options, transport: { targets } });
}

export function resolveApiLogFilePath(logFilePath: string): string {
	return isAbsolute(logFilePath) ? logFilePath : resolve(__dirname, '../../../', logFilePath);
}

function resolveLowestLogLevel(levels: readonly ApiLogLevel[]): ApiLogLevel {
	const priority: Record<ApiLogLevel, number> = {
		trace: 10,
		debug: 20,
		info: 30,
		warn: 40,
		error: 50,
		fatal: 60,
		silent: 70
	};

	return levels.reduce((lowest, level) => (priority[level] < priority[lowest] ? level : lowest), levels[0] ?? 'info');
}
