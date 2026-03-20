import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const hasContainerRuntime = Boolean(process.env.DOCKER_HOST) || existsSync('/var/run/docker.sock') || existsSync('/var/run/docker.sock.raw');

export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		exclude: hasContainerRuntime ? [] : ['tests/integration/**/*.test.ts'],
		setupFiles: ['tests/support/env.ts'],
		clearMocks: true,
		restoreMocks: true,
		passWithNoTests: false,
		fileParallelism: false,
		hookTimeout: 30_000
	}
});
