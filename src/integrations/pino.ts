import { ILogger, LogLevel } from '@sapphire/framework';
import pino, { type Logger as PinoLogger, type TransportMultiOptions } from 'pino';
import { ENV_CONFIG } from '../config/env';

type PinoLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

const SAPPHIRE_TO_PINO_LEVEL: Record<LogLevel, PinoLevel> = {
	[LogLevel.Trace]: 'trace',
	[LogLevel.Debug]: 'debug',
	[LogLevel.Info]: 'info',
	[LogLevel.Warn]: 'warn',
	[LogLevel.Error]: 'error',
	[LogLevel.Fatal]: 'fatal',
	[LogLevel.None]: 'silent'
};

type TransportTarget = NonNullable<TransportMultiOptions['targets']>[number];
const BETTER_STACK_LOG_LEVEL: PinoLevel = ENV_CONFIG.LOG_LEVEL;
const transportTargets: TransportTarget[] = [
	{
		target: 'pino-pretty',
		level: ENV_CONFIG.LOG_LEVEL,
		options: {
			colorize: true
		}
	},
	{
		target: 'pino/file',
		level: ENV_CONFIG.LOCAL_FILE_LOG_LEVEL,
		options: {
			destination: ENV_CONFIG.LOCAL_LOG_FILE_PATH,
			mkdir: true
		}
	}
];
const enabledTargetLevels: PinoLevel[] = [ENV_CONFIG.LOG_LEVEL, ENV_CONFIG.LOCAL_FILE_LOG_LEVEL];

if (ENV_CONFIG.BETTER_STACK_SOURCE_TOKEN && ENV_CONFIG.BETTER_STACK_INGESTING_HOST) {
	transportTargets.push({
		target: '@logtail/pino',
		level: BETTER_STACK_LOG_LEVEL,
		options: {
			sourceToken: ENV_CONFIG.BETTER_STACK_SOURCE_TOKEN,
			options: { endpoint: ENV_CONFIG.BETTER_STACK_INGESTING_HOST }
		}
	});
	enabledTargetLevels.push(BETTER_STACK_LOG_LEVEL);
}
const ROOT_LOG_LEVEL = resolveLowestPinoLevel(enabledTargetLevels);

export const PINO_LOGGER = pino({
	level: ROOT_LOG_LEVEL,
	transport: {
		targets: transportTargets
	}
});

export class SapphirePinoLogger implements ILogger {
	public constructor(private readonly logger: PinoLogger = PINO_LOGGER) {}

	public has(level: LogLevel): boolean {
		if (level === LogLevel.None) return false;

		const mappedLevel = SAPPHIRE_TO_PINO_LEVEL[level];
		return typeof this.logger.isLevelEnabled === 'function' ? this.logger.isLevelEnabled(mappedLevel) : true;
	}

	public trace(...values: readonly unknown[]): void {
		this.write(LogLevel.Trace, ...values);
	}

	public debug(...values: readonly unknown[]): void {
		this.write(LogLevel.Debug, ...values);
	}

	public info(...values: readonly unknown[]): void {
		this.write(LogLevel.Info, ...values);
	}

	public warn(...values: readonly unknown[]): void {
		this.write(LogLevel.Warn, ...values);
	}

	public error(...values: readonly unknown[]): void {
		this.write(LogLevel.Error, ...values);
	}

	public fatal(...values: readonly unknown[]): void {
		this.write(LogLevel.Fatal, ...values);
	}

	public write(level: LogLevel, ...values: readonly unknown[]): void {
		if (level === LogLevel.None) return;

		const mappedLevel = SAPPHIRE_TO_PINO_LEVEL[level];
		switch (mappedLevel) {
			case 'trace':
				this.writeWithMethod(this.logger.trace.bind(this.logger), values);
				return;
			case 'debug':
				this.writeWithMethod(this.logger.debug.bind(this.logger), values);
				return;
			case 'info':
				this.writeWithMethod(this.logger.info.bind(this.logger), values);
				return;
			case 'warn':
				this.writeWithMethod(this.logger.warn.bind(this.logger), values);
				return;
			case 'error':
				this.writeWithMethod(this.logger.error.bind(this.logger), values);
				return;
			case 'fatal':
				this.writeWithMethod(this.logger.fatal.bind(this.logger), values);
				return;
			case 'silent':
				return;
			default:
				return;
		}
	}

	private writeWithMethod(method: (...args: unknown[]) => void, values: readonly unknown[]) {
		method(...(values as unknown[]));
	}
}

export const SAPPHIRE_LOGGER = new SapphirePinoLogger(PINO_LOGGER);

function resolveLowestPinoLevel(levels: readonly PinoLevel[]): PinoLevel {
	const LOG_LEVEL_PRIORITY: Record<PinoLevel, number> = {
		trace: 10,
		debug: 20,
		info: 30,
		warn: 40,
		error: 50,
		fatal: 60,
		silent: 70
	};

	let lowestLevel = levels[0] ?? 'info';
	for (const level of levels) {
		if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[lowestLevel]) {
			lowestLevel = level;
		}
	}

	return lowestLevel;
}
