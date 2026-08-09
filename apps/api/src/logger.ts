import pino, { type DestinationStream, type Logger } from 'pino';

import type { ApiConfig } from './config';

export function createApiLogger(config: Pick<ApiConfig, 'logLevel' | 'nodeEnv'>, destination?: DestinationStream): Logger {
	return pino(
		{
			level: config.logLevel,
			base: {
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
		},
		destination
	);
}
