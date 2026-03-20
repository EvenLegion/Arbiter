import { spawnSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

const CONTAINER_RUNTIME_PROBES = [
	{ command: 'docker', args: ['info'] },
	{ command: 'podman', args: ['info'] }
];

const hasContainerRuntime =
	process.env.ARBITER_HAS_CONTAINER_RUNTIME === '1' ||
	CONTAINER_RUNTIME_PROBES.some(({ command, args }) => {
		const result = spawnSync(command, args, {
			stdio: 'ignore',
			shell: process.platform === 'win32'
		});

		return result.status === 0;
	});

export default defineConfig({
	test: {
		environment: 'node',
		include: hasContainerRuntime ? ['tests/integration/**/*.test.ts'] : [],
		setupFiles: ['tests/support/env.ts'],
		clearMocks: true,
		restoreMocks: true,
		passWithNoTests: !hasContainerRuntime,
		fileParallelism: false,
		hookTimeout: 30_000
	}
});
