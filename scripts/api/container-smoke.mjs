import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';

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
			"const fs=require('node:fs'); require('@prisma/client'); require('@arbiter/api-contracts'); require('@arbiter/domain'); if (fs.existsSync('/app/apps/portal')) process.exit(1); for (const name of ['@arbiter/portal','vitest']) { try { require.resolve(name); process.exit(1); } catch {} }"
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
			'API_DISCORD_CLIENT_ID=100000000000000001',
			'--env',
			'API_DISCORD_CLIENT_SECRET=container-smoke-discord-secret',
			'--env',
			'API_DISCORD_CALLBACK_URL=https://api.example.invalid/api/v1/auth/discord/callback',
			'--env',
			'API_ALLOWED_ORIGINS=https://portal.example.invalid',
			'--env',
			'API_AUTH_REDIRECT_URLS=https://portal.example.invalid/auth/callback',
			'--env',
			'API_PUBLIC_URL=https://api.example.invalid',
			'--env',
			'API_TRUST_PROXY=true',
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

	const directBypass = await fetch(`http://127.0.0.1:${port}/api/v1/users/100000000000000001`);
	if (directBypass.status !== 403 || (await directBypass.json()).error?.code !== 'origin_not_allowed') {
		throw new Error('API container did not reject a request that bypassed the configured production proxy');
	}
	const directDirectory = await proxyRequest(port, '/api/v1/users/100000000000000001');
	if (directDirectory.status !== 401 || directDirectory.body.error?.code !== 'unauthorized') {
		throw new Error('API container did not expose the credential-protected direct directory route');
	}
	const queryDirectory = await proxyRequest(port, '/api/v1/users/query', {
		method: 'POST',
		body: '{}'
	});
	if (queryDirectory.status !== 401 || queryDirectory.body.error?.code !== 'unauthorized') {
		throw new Error('API container did not expose the credential-protected directory query route');
	}

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
	process.stdout.write('API container health, protected directory routes, file logging, and graceful-stop smoke test passed.\n');
} finally {
	if (containerId) {
		execFileSync('docker', ['rm', '--force', containerId], { stdio: 'ignore' });
	}
	if (imageBuilt) {
		execFileSync('docker', ['image', 'rm', '--force', image], { stdio: 'ignore' });
	}
}

function proxyRequest(port, path, { method = 'GET', body } = {}) {
	return new Promise((resolve, reject) => {
		const request = httpRequest(
			{
				host: '127.0.0.1',
				port,
				path,
				method,
				headers: {
					host: 'api.example.invalid',
					'x-forwarded-host': 'api.example.invalid',
					'x-forwarded-proto': 'https',
					...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {})
				}
			},
			(response) => {
				const chunks = [];
				response.on('data', (chunk) => chunks.push(chunk));
				response.on('end', () => {
					try {
						resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
					} catch (error) {
						reject(error);
					}
				});
			}
		);
		request.on('error', reject);
		if (body) request.write(body);
		request.end();
	});
}
