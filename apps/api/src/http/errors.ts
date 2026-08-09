import type { ApiErrorCode, ApiErrorEnvelope } from '@arbiter/api-contracts';

export class ApiHttpError extends Error {
	public constructor(
		public readonly statusCode: number,
		public readonly code: ApiErrorCode,
		message: string
	) {
		super(message);
		this.name = 'ApiHttpError';
	}
}

export function toApiError(error: unknown): ApiHttpError {
	if (error instanceof ApiHttpError) return error;
	return new ApiHttpError(500, 'internal_error', 'Internal server error');
}

export function createErrorEnvelope(error: ApiHttpError, requestId: string): ApiErrorEnvelope {
	return {
		error: {
			code: error.code,
			message: error.message,
			requestId
		}
	};
}
