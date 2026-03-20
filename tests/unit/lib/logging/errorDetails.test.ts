import { describe, expect, it } from 'vitest';

import { toErrorDetails, toErrorLogFields } from '../../../../src/lib/logging/errorDetails';

describe('errorDetails', () => {
	it('extracts message, name, and string code from Error instances', () => {
		const error = new Error('boom');
		error.name = 'CustomError';
		Reflect.set(error, 'code', 'E_CUSTOM');

		expect(toErrorDetails(error)).toEqual({
			errorMessage: 'boom',
			errorName: 'CustomError',
			errorCode: 'E_CUSTOM'
		});
	});

	it('ignores non-string codes attached to Error instances', () => {
		const error = new Error('boom');
		Reflect.set(error, 'code', 500);

		expect(toErrorDetails(error)).toEqual({
			errorMessage: 'boom',
			errorName: 'Error'
		});
	});

	it('normalizes string and unknown thrown values', () => {
		expect(toErrorDetails('plain failure')).toEqual({
			errorMessage: 'plain failure',
			errorName: 'Error'
		});

		expect(toErrorDetails({ failure: true })).toEqual({
			errorMessage: 'Unknown error'
		});
	});

	it('includes the original thrown value in log fields', () => {
		const error = new Error('boom');

		expect(toErrorLogFields(error)).toEqual({
			err: error,
			errorMessage: 'boom',
			errorName: 'Error'
		});
	});
});
