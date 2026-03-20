import { spawnSync } from 'node:child_process';

const CONTAINER_RUNTIME_PROBES = [
	{ command: 'docker', args: ['info'] },
	{ command: 'podman', args: ['info'] }
];

const hasContainerRuntime = CONTAINER_RUNTIME_PROBES.some(({ command, args }) => {
	const result = spawnSync(command, args, {
		stdio: 'ignore',
		shell: process.platform === 'win32'
	});

	return result.status === 0;
});

if (!hasContainerRuntime) {
	console.log('Skipping integration tests because no container runtime was detected.');
	process.exit(0);
}

const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', 'vitest.integration.config.ts', ...process.argv.slice(2)], {
	stdio: 'inherit',
	env: {
		...process.env,
		ARBITER_HAS_CONTAINER_RUNTIME: '1'
	},
	shell: process.platform === 'win32'
});

if (typeof result.status === 'number') {
	process.exit(result.status);
}

process.exit(1);
