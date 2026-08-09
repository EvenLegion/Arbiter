import type { IncomingMessage } from 'node:http';

import { ApiHttpError } from './errors';

export async function validateRequestBody(request: IncomingMessage, limitBytes: number): Promise<void> {
	const contentLength = Number(request.headers['content-length'] ?? 0);
	const hasTransferEncoding = request.headers['transfer-encoding'] !== undefined;
	if (!hasTransferEncoding && contentLength === 0) return;
	if (Number.isFinite(contentLength) && contentLength > limitBytes) {
		throw new ApiHttpError(413, 'payload_too_large', 'Request body is too large');
	}

	const chunks: Buffer[] = [];
	let receivedBytes = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		receivedBytes += buffer.length;
		if (receivedBytes > limitBytes) {
			throw new ApiHttpError(413, 'payload_too_large', 'Request body is too large');
		}
		chunks.push(buffer);
	}

	if (receivedBytes === 0) return;
	if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
		throw new ApiHttpError(400, 'bad_request', 'Request body must use application/json');
	}

	try {
		JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch {
		throw new ApiHttpError(400, 'bad_request', 'Request body must contain valid JSON');
	}
}
