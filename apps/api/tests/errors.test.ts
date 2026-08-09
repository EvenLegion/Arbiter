import { describe, expect, it } from 'vitest';

import { createErrorEnvelope, toApiError } from '../src/http/errors';

describe('API error mapping', () => {
	it('sanitizes unknown failures into one request-correlated envelope', () => {
		const error = toApiError(new Error('postgresql://user:secret@database/internal'));
		expect(createErrorEnvelope(error, 'request-1')).toEqual({
			error: {
				code: 'internal_error',
				message: 'Internal server error',
				requestId: 'request-1'
			}
		});
	});
});
