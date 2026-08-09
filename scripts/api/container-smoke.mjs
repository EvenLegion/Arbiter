import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const image = `arbiter-api-smoke:${randomUUID()}`;
let containerId;
let imageBuilt = false;

try {
	execFileSync('docker', ['build', '--file', 'Dockerfile.api', '--tag', image, '.'], { stdio: 'inherit' });
	imageBuilt = true;
	execFileSync(
		'docker',
		[
			'run',
			'--rm',
			'--entrypoint',
			'node',
			image,
			'-e',
			"require('@prisma/client'); require('@arbiter/api-contracts'); require('@arbiter/domain'); try { require.resolve('vitest'); process.exit(1); } catch {}"
		],
		{ stdio: 'inherit' }
	);
	containerId = execFileSync(
		'docker',
		[
			'run',
			'--detach',
			'--publish',
			'127.0.0.1::3000',
			'--env',
			'DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused',
			'--env',
			'API_CREDENTIAL_PEPPER=container-smoke-test-pepper-at-least-32-characters',
			'--env',
			'REDIS_HOST=127.0.0.1',
			'--env',
			'REDIS_PORT=1',
			image
		],
		{ encoding: 'utf8' }
	).trim();

	const portOutput = execFileSync('docker', ['port', containerId, '3000/tcp'], { encoding: 'utf8' }).trim();
	const port = portOutput.slice(portOutput.lastIndexOf(':') + 1);
	const deadline = Date.now() + 30_000;
	let healthy = false;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
			if (response.ok) {
				healthy = true;
				break;
			}
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
	}
	if (!healthy) throw new Error('API container did not become healthy');

	const logDeadline = Date.now() + 10_000;
	let fileLoggingVerified = false;
	while (Date.now() < logDeadline) {
		try {
			execFileSync(
				'docker',
				[
					'exec',
					containerId,
					'node',
					'-e',
					"const fs=require('node:fs'); const records=fs.readFileSync('/app/logs/api.log','utf8').trim().split('\\n').map(JSON.parse); if (!records.some((record) => record.app === 'arbiter' && record.service === 'arbiter-api' && record.requestId && record.path === '/api/v1/health')) process.exit(1);"
				],
				{ stdio: 'ignore' }
			);
			fileLoggingVerified = true;
			break;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
	}
	if (!fileLoggingVerified) throw new Error('API container did not write its structured request log');

	execFileSync('docker', ['stop', '--timeout', '10', containerId], { stdio: 'inherit' });
	execFileSync('docker', ['rm', containerId], { stdio: 'ignore' });
	containerId = undefined;
	process.stdout.write('API container health, file logging, and graceful-stop smoke test passed.\n');
} finally {
	if (containerId) {
		execFileSync('docker', ['rm', '--force', containerId], { stdio: 'ignore' });
	}
	if (imageBuilt) {
		execFileSync('docker', ['image', 'rm', '--force', image], { stdio: 'ignore' });
	}
}
