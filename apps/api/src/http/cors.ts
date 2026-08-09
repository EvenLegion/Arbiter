import type { IncomingMessage, ServerResponse } from 'node:http';

import { ApiHttpError } from './errors';

export function applyExactOriginCors(request: IncomingMessage, response: ServerResponse, allowedOrigins: readonly string[]): void {
	const originHeader = request.headers.origin;
	if (originHeader === undefined) return;
	if (typeof originHeader !== 'string' || !allowedOrigins.includes(originHeader)) {
		throw new ApiHttpError(403, 'origin_not_allowed', 'Origin is not allowed');
	}
	response.setHeader('access-control-allow-origin', originHeader);
	response.setHeader('access-control-allow-credentials', 'true');
	response.setHeader('vary', 'Origin');
}

export function writeCorsPreflight(response: ServerResponse): void {
	response.statusCode = 204;
	response.setHeader('access-control-allow-methods', 'GET, POST, HEAD, OPTIONS');
	response.setHeader('access-control-allow-headers', 'Content-Type, X-CSRF-Token, X-Request-Id');
	response.setHeader('access-control-max-age', '600');
	response.end();
}
