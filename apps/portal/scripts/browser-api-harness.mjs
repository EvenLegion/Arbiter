import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const HOST = '127.0.0.1';
const PORT = 3000;
const PORTAL_ORIGIN = 'http://127.0.0.1:4173';
const USER_ID = '33b20a61-1e86-4115-b999-f319808d5a87';
const CSRF_TOKEN = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
const SESSION_ID = 'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH';

let sequence = 0;
let integrations = [
	registryItem({
		id: 'd3234d29-3990-412c-a8d3-10db55d9e49f',
		name: 'Roster intelligence',
		purpose: 'Read canonical staff-authorized member directory data for planning tools.',
		credentialCount: 2
	}),
	registryItem({
		id: '1e539eb7-ef3e-4380-8ca9-b0ef89306b90',
		name: 'Training operations',
		purpose: 'Coordinate approved training workflows without direct access to Arbiter storage.',
		credentialCount: 1
	})
];

const server = createServer(async (request, response) => {
	const requestId = `harness-${randomUUID()}`;
	const url = new URL(request.url ?? '/', `http://${HOST}:${PORT}`);
	response.setHeader('content-type', 'application/json; charset=utf-8');
	response.setHeader('cache-control', 'no-store');
	response.setHeader('x-request-id', requestId);
	const origin = request.headers.origin;
	if (origin && origin !== PORTAL_ORIGIN) return error(response, 403, 'origin_not_allowed', 'Origin is not allowed', requestId);
	if (origin === PORTAL_ORIGIN) {
		response.setHeader('access-control-allow-origin', origin);
		response.setHeader('access-control-allow-credentials', 'true');
		response.setHeader('vary', 'Origin');
	}
	if (request.method === 'OPTIONS') {
		response.statusCode = 204;
		response.setHeader('access-control-allow-methods', 'GET, POST, PATCH, OPTIONS');
		response.setHeader('access-control-allow-headers', 'Content-Type, X-CSRF-Token');
		response.end();
		return;
	}
	if (url.pathname === '/api/v1/auth/discord/start' && request.method === 'POST') {
		return json(response, 200, {
			data: { authorizationUrl: `http://${HOST}:${PORT}/harness/login` },
			meta: { requestId }
		});
	}
	if (url.pathname === '/harness/login' && request.method === 'GET') {
		response.statusCode = 302;
		response.removeHeader('content-type');
		response.setHeader('set-cookie', sessionCookie(SESSION_ID));
		response.setHeader('location', `${PORTAL_ORIGIN}/auth/callback`);
		response.setHeader('content-length', '0');
		response.end();
		return;
	}
	if (isProtectedRoute(url.pathname) && !hasSession(request)) {
		return error(response, 401, 'unauthorized', 'Authentication required', requestId);
	}

	if (url.pathname === '/api/v1/auth/session' && request.method === 'GET') {
		return json(response, 200, {
			data: {
				authenticated: true,
				csrfToken: CSRF_TOKEN,
				idleExpiresAt: '2026-08-10T08:30:00.000Z',
				absoluteExpiresAt: '2026-08-10T16:00:00.000Z'
			},
			meta: { requestId }
		});
	}
	if (url.pathname === '/api/v1/auth/me' && request.method === 'GET') {
		return json(response, 200, {
			data: {
				userId: USER_ID,
				discordUserId: '100000000000000001',
				discordUsername: 'exec-harness',
				discordNickname: 'Astra Vale',
				discordAvatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
				role: 'EXEC'
			},
			meta: { requestId }
		});
	}
	if (url.pathname === '/api/v1/auth/logout' && request.method === 'POST') {
		if (!hasCsrf(request)) return error(response, 403, 'csrf_failed', 'CSRF validation failed', requestId);
		response.setHeader('set-cookie', sessionCookie('', 0));
		return json(response, 200, { data: { loggedOut: true }, meta: { requestId } });
	}
	if (url.pathname === '/api/v1/integrations' && request.method === 'GET') {
		const includeArchived = url.searchParams.get('includeArchived') === 'true';
		return json(response, 200, {
			data: { integrations: integrations.filter((integration) => includeArchived || integration.state === 'active') },
			meta: { requestId }
		});
	}
	if (url.pathname === '/api/v1/integrations' && request.method === 'POST') {
		if (!hasCsrf(request)) return error(response, 403, 'csrf_failed', 'CSRF validation failed', requestId);
		const body = await readBody(request);
		if (!body || typeof body.name !== 'string' || typeof body.purpose !== 'string') {
			return error(response, 400, 'bad_request', 'Integration request is invalid', requestId);
		}
		const integration = registryItem({ id: randomUUID(), name: body.name.trim(), purpose: body.purpose.trim(), credentialCount: 0 });
		integrations = [integration, ...integrations];
		return json(response, 201, { data: integration, meta: { requestId } });
	}

	const editMatch = url.pathname.match(/^\/api\/v1\/integrations\/([0-9a-f-]+)$/);
	if (editMatch && request.method === 'PATCH') {
		if (!hasCsrf(request)) return error(response, 403, 'csrf_failed', 'CSRF validation failed', requestId);
		const body = await readBody(request);
		const index = integrations.findIndex((integration) => integration.id === editMatch[1]);
		if (index < 0) return error(response, 404, 'not_found', 'Integration was not found', requestId);
		const current = integrations[index];
		if (!body || typeof body.name !== 'string' || typeof body.purpose !== 'string') {
			return error(response, 400, 'bad_request', 'Integration update is invalid', requestId);
		}
		if (body.expectedUpdatedAt !== current.updatedAt) {
			return error(response, 409, 'stale', 'Integration changed; refresh before trying again', requestId);
		}
		const updated = { ...current, name: body.name.trim(), purpose: body.purpose.trim(), updatedAt: nextTimestamp() };
		integrations[index] = updated;
		return json(response, 200, { data: updated, meta: { requestId } });
	}

	const archiveMatch = url.pathname.match(/^\/api\/v1\/integrations\/([0-9a-f-]+)\/archive$/);
	if (archiveMatch && request.method === 'POST') {
		if (!hasCsrf(request)) return error(response, 403, 'csrf_failed', 'CSRF validation failed', requestId);
		const body = await readBody(request);
		const index = integrations.findIndex((integration) => integration.id === archiveMatch[1]);
		if (index < 0) return error(response, 404, 'not_found', 'Integration was not found', requestId);
		const current = integrations[index];
		if (current.state === 'active' && (!body || body.expectedUpdatedAt !== current.updatedAt)) {
			return error(response, 409, 'stale', 'Integration changed; refresh before trying again', requestId);
		}
		const archived = {
			...current,
			state: 'archived',
			archivedByUserId: USER_ID,
			archivedAt: current.archivedAt ?? nextTimestamp(),
			updatedByUserId: USER_ID,
			updatedAt: current.state === 'archived' ? current.updatedAt : nextTimestamp()
		};
		integrations[index] = archived;
		return json(response, 200, { data: archived, meta: { requestId } });
	}

	return error(response, 404, 'not_found', 'Route not found', requestId);
});

server.listen(PORT, HOST, () => {
	process.stdout.write(`Safe portal browser harness listening at http://${HOST}:${PORT}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => server.close(() => process.exit(0)));
}

function registryItem({ id, name, purpose, credentialCount }) {
	const timestamp = nextTimestamp();
	return {
		id,
		name,
		purpose,
		state: 'active',
		createdByUserId: USER_ID,
		updatedByUserId: USER_ID,
		archivedByUserId: null,
		archivedAt: null,
		createdAt: timestamp,
		updatedAt: timestamp,
		creator: { userId: USER_ID, discordUsername: 'exec-harness', discordNickname: 'Astra Vale' },
		credentialCount
	};
}

function nextTimestamp() {
	sequence += 1;
	return new Date(Date.UTC(2026, 7, 9, 20, 0, sequence)).toISOString();
}

function hasCsrf(request) {
	return hasSession(request) && request.headers['x-csrf-token'] === CSRF_TOKEN;
}

function hasSession(request) {
	return (request.headers.cookie ?? '').split(';').some((cookie) => cookie.trim() === `arbiter_session=${SESSION_ID}`);
}

function isProtectedRoute(pathname) {
	return (
		pathname === '/api/v1/auth/session' ||
		pathname === '/api/v1/auth/me' ||
		pathname === '/api/v1/auth/logout' ||
		pathname.startsWith('/api/v1/integrations')
	);
}

function sessionCookie(value, maxAge = 1800) {
	return `arbiter_session=${value}; Path=/api/v1; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;
}

async function readBody(request) {
	const chunks = [];
	for await (const chunk of request) chunks.push(chunk);
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch {
		return null;
	}
}

function json(response, status, payload) {
	const body = JSON.stringify(payload);
	response.statusCode = status;
	response.setHeader('content-length', Buffer.byteLength(body));
	response.end(body);
}

function error(response, status, code, message, requestId) {
	json(response, status, { error: { code, message, requestId } });
}
