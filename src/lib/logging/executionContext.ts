import { randomUUID } from 'node:crypto';
import { PINO_LOGGER } from '../../integrations/pino';

export interface ContextLogger {
	trace(...values: readonly unknown[]): void;
	debug(...values: readonly unknown[]): void;
	info(...values: readonly unknown[]): void;
	warn(...values: readonly unknown[]): void;
	error(...values: readonly unknown[]): void;
	fatal(...values: readonly unknown[]): void;
	child(bindings: Record<string, unknown>): ContextLogger;
}

export type ExecutionContext = {
	requestId: string;
	logger: ContextLogger;
};

type CreateExecutionContextParams = {
	requestId?: string;
	bindings?: Record<string, unknown>;
};

type CreateChildExecutionContextParams = {
	context: ExecutionContext;
	bindings?: Record<string, unknown>;
};

export function createExecutionContext({
	requestId = randomUUID(),
	bindings = {},
}: CreateExecutionContextParams = {}): ExecutionContext {
	const logger = (PINO_LOGGER as ContextLogger).child({
		requestId,
		...bindings,
	});

	return {
		requestId,
		logger,
	};
}

export function createChildExecutionContext({
	context,
	bindings = {},
}: CreateChildExecutionContextParams): ExecutionContext {
	const hasBindings = Object.keys(bindings).length > 0;

	return {
		requestId: context.requestId,
		logger: hasBindings ? context.logger.child(bindings) : context.logger,
	};
}
