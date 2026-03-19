import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const hasContainerRuntime = Boolean(process.env.DOCKER_HOST) || existsSync('/var/run/docker.sock') || existsSync('/var/run/docker.sock.raw');

if (!hasContainerRuntime) {
	console.log('Skipping integration tests because no container runtime was detected.');
	process.exit(0);
}

const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', 'vitest.integration.config.ts', ...process.argv.slice(2)], {
	stdio: 'inherit',
	shell: process.platform === 'win32'
});

if (typeof result.status === 'number') {
	process.exit(result.status);
}

process.exit(1);
