import { parseApiConfig } from './config';
import { createApiRuntime, type ApiRuntime } from './http/server';
import { createApiLogger } from './logger';
import { createApiDependencies } from './runtime/dependencies';

export async function runApi(): Promise<ApiRuntime> {
	const config = parseApiConfig();
	const logger = createApiLogger(config);
	const dependencies = createApiDependencies(config, logger);
	const runtime = createApiRuntime({ config, dependencies, logger });
	let address: Awaited<ReturnType<ApiRuntime['start']>>;
	try {
		address = await runtime.start();
	} catch (error) {
		await dependencies.close();
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
			process.exitCode = 1;
		}
	};

	process.once('SIGINT', () => void shutdown('SIGINT', 0));
	process.once('SIGTERM', () => void shutdown('SIGTERM', 0));
	process.once('uncaughtException', (error) => {
		logger.fatal({ errorName: error.name }, 'Arbiter API uncaught exception');
		void shutdown('uncaughtException', 1);
	});
	process.once('unhandledRejection', (reason) => {
		logger.fatal({ errorName: reason instanceof Error ? reason.name : 'UnhandledRejection' }, 'Arbiter API unhandled rejection');
		void shutdown('unhandledRejection', 1);
	});

	return runtime;
}

if (require.main === module) {
	void runApi().catch((error) => {
		process.stderr.write(`Arbiter API failed to start (${error instanceof Error ? error.name : 'UnknownError'})\n`);
		process.exitCode = 1;
	});
}
