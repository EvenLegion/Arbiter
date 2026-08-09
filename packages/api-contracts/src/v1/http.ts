import { z } from 'zod';

export const API_V1_PREFIX = '/api/v1' as const;
export const API_V1_ROUTES = {
	health: `${API_V1_PREFIX}/health`,
	readiness: `${API_V1_PREFIX}/readiness`
} as const;

export const RequestIdSchema = z
	.string()
	.min(1)
	.max(128)
	.regex(/^[A-Za-z0-9._:-]+$/);

export const ApiResponseMetaSchema = z.object({
	requestId: RequestIdSchema
});

export const HealthResponseSchema = z.object({
	data: z.object({ status: z.literal('ok') }),
	meta: ApiResponseMetaSchema
});

export const ReadinessResponseSchema = z.object({
	data: z.object({ status: z.enum(['ready', 'not_ready']) }),
	meta: ApiResponseMetaSchema
});

export const ApiErrorCodeSchema = z.enum([
	'bad_request',
	'method_not_allowed',
	'not_found',
	'payload_too_large',
	'request_timeout',
	'service_unavailable',
	'internal_error'
]);

export const ApiErrorEnvelopeSchema = z.object({
	error: z.object({
		code: ApiErrorCodeSchema,
		message: z.string().min(1),
		requestId: RequestIdSchema
	})
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;
