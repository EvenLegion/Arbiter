import { afterEach, describe, expect, it, vi } from 'vitest';

describe('pino integration', () => {
	afterEach(() => {
		vi.resetModules();
		vi.unstubAllEnvs();
	});

	it('always configures a file sink and omits console when CONSOLE_LOG_LEVEL=silent', async () => {
		const pinoFactory = vi.fn(() => ({
			child: vi.fn(() => ({
				trace: vi.fn(),
				debug: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
				fatal: vi.fn(),
				child: vi.fn()
			}))
		}));

		vi.doMock('pino', () => ({
			default: pinoFactory
		}));

		vi.stubEnv('NODE_ENV', 'development');
		vi.stubEnv('FILE_LOG_LEVEL', 'debug');
		vi.stubEnv('LOG_FILE_PATH', 'logs/test.log');
		vi.stubEnv('CONSOLE_LOG_LEVEL', 'silent');
		vi.stubEnv('ENABLE_CONSOLE_PRETTY_LOGS', 'false');

		await import('../../../src/integrations/pino');

		expect(pinoFactory).toHaveBeenCalledWith(
			expect.objectContaining({
				level: 'debug',
				transport: {
					targets: [
						expect.objectContaining({
							target: 'pino/file',
							level: 'debug',
							options: expect.objectContaining({
								destination: 'logs/test.log'
							})
						})
					]
				}
			})
		);
	});

	it('adds the console mirror when CONSOLE_LOG_LEVEL is enabled', async () => {
		const pinoFactory = vi.fn(() => ({
			child: vi.fn(() => ({
				trace: vi.fn(),
				debug: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
				fatal: vi.fn(),
				child: vi.fn()
			}))
		}));

		vi.doMock('pino', () => ({
			default: pinoFactory
		}));

		vi.stubEnv('NODE_ENV', 'development');
		vi.stubEnv('FILE_LOG_LEVEL', 'debug');
		vi.stubEnv('LOG_FILE_PATH', 'logs/test.log');
		vi.stubEnv('CONSOLE_LOG_LEVEL', 'info');
		vi.stubEnv('ENABLE_CONSOLE_PRETTY_LOGS', 'true');

		await import('../../../src/integrations/pino');

		expect(pinoFactory).toHaveBeenCalledWith(
			expect.objectContaining({
				level: 'debug',
				transport: {
					targets: expect.arrayContaining([
						expect.objectContaining({
							target: 'pino/file',
							level: 'debug'
						}),
						expect.objectContaining({
							target: 'pino-pretty',
							level: 'info'
						})
					])
				}
			})
		);
	});
});
