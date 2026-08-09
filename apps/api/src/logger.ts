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
				'req.headers.authorization',
				'req.headers.cookie',
				'config.databaseUrl',
				'config.redis.password',
				'password',
				'secret',
				'token'
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
				destination: config.logFilePath,
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
