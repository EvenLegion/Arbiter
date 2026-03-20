import { vi } from 'vitest';

import type { ExecutionContext } from '../../src/lib/logging/executionContext';

export type MockLogger = ExecutionContext['logger'] & {
	trace: ReturnType<typeof vi.fn>;
	debug: ReturnType<typeof vi.fn>;
	info: ReturnType<typeof vi.fn>;
	warn: ReturnType<typeof vi.fn>;
	error: ReturnType<typeof vi.fn>;
	fatal: ReturnType<typeof vi.fn>;
	child: ReturnType<typeof vi.fn>;
};

export function createMockLogger(): MockLogger {
	const logger = {
		trace: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		fatal: vi.fn(),
		child: vi.fn()
	} as unknown as MockLogger;

	logger.child.mockImplementation(() => logger);

	return logger;
}

export function createMockExecutionContext({
	requestId = 'test-request-id',
	logger = createMockLogger()
}: {
	requestId?: string;
	logger?: MockLogger;
} = {}): ExecutionContext {
	return {
		requestId,
		logger
	};
}
