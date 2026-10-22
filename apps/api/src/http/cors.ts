import type { IncomingMessage, ServerResponse } from 'node:http';

import { API_CONTRACT_VERSION_HEADER } from '@arbiter/api-contracts';

import { ApiHttpError } from './errors';

export function applyExactOriginCors(request: IncomingMessage, response: ServerResponse, allowedOrigins: readonly string[]): void {
	const originHeader = request.headers.origin;
	if (originHeader === undefined) return;
	if (typeof originHeader !== 'string' || !allowedOrigins.includes(originHeader)) {
		throw new ApiHttpError(403, 'origin_not_allowed', 'Origin is not allowed');
	}
	response.setHeader('access-control-allow-origin', originHeader);
	response.setHeader('access-control-allow-credentials', 'true');
	response.setHeader('access-control-expose-headers', `X-Request-Id, ${API_CONTRACT_VERSION_HEADER}`);
	response.setHeader('vary', 'Origin');
}

export function writeCorsPreflight(response: ServerResponse): void {
	response.statusCode = 204;
	response.setHeader('access-control-allow-methods', 'GET, POST, PATCH, HEAD, OPTIONS');
	response.setHeader('access-control-allow-headers', 'Authorization, Content-Type, X-CSRF-Token, X-Request-Id');
	response.setHeader('access-control-expose-headers', `X-Request-Id, ${API_CONTRACT_VERSION_HEADER}`);
	response.setHeader('access-control-max-age', '600');
	response.end();
}
