import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

import { parseApiConfig } from './config';
import { createApiRuntime, type ApiRuntime } from './http/server';
import { createApiLogger } from './logger';
import { createApiDependencies } from './runtime/dependencies';

export * from './auth';
export * from './credentials';
export * from './directory';

export async function runApi(): Promise<ApiRuntime> {
	loadApiEnvironment();
	const config = parseApiConfig();
	const logger = createApiLogger(config);
	const dependencies = createApiDependencies(config, logger);
	const runtime = createApiRuntime({ config, dependencies, logger });
	let address: Awaited<ReturnType<ApiRuntime['start']>>;
	try {
		address = await runtime.start();
	} catch (error) {
		await dependencies.close().catch((closeError) => {
			logger.error(
				{ errorName: closeError instanceof Error ? closeError.name : 'UnknownError' },
				'Arbiter API dependency cleanup failed during startup'
			);
		});
		throw error;
	}
	logger.info({ host: address.host, port: address.port }, 'Arbiter API started');

	let shuttingDown = false;
	const shutdown = async (reason: string, exitCode: number) => {
		if (shuttingDown) return;
		shuttingDown = true;
		logger.info({ reason }, 'Arbiter API stopping');
		try {
			await runtime.stop();
			logger.info({ reason }, 'Arbiter API stopped');
			process.exitCode = exitCode;
		} catch (error) {
			logger.error({ reason, errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Arbiter API shutdown failed');
			// The graceful deadline has expired or cleanup failed. A hard exit is
			// required because dependency sockets may still be holding the loop open.
			process.exit(1);
		}
	};

	process.once('SIGINT', () => void shutdown('SIGINT', 0));
	process.once('SIGTERM', () => void shutdown('SIGTERM', 0));
	process.on('uncaughtException', (error) => {
		logger.fatal({ errorName: error.name }, 'Arbiter API uncaught exception');
		void shutdown('uncaughtException', 1);
	});
	process.on('unhandledRejection', (reason) => {
		logger.fatal({ errorName: reason instanceof Error ? reason.name : 'UnhandledRejection' }, 'Arbiter API unhandled rejection');
		void shutdown('unhandledRejection', 1);
	});

	return runtime;
}

export function loadApiEnvironment(envFilePath = resolve(__dirname, '../../../.env')): void {
	try {
		loadEnvFile(envFilePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
}

if (require.main === module) {
	void runApi().catch((error) => {
		process.stderr.write(`Arbiter API failed to start (${error instanceof Error ? error.name : 'UnknownError'})\n`);
		process.exitCode = 1;
	});
}
