import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import {
	API_CREDENTIAL_PREFIX_BYTES,
	API_CREDENTIAL_PREFIX_LENGTH,
	API_CREDENTIAL_SCHEME,
	API_CREDENTIAL_SECRET_BYTES,
	API_CREDENTIAL_SECRET_PATTERN
} from '@arbiter/api-contracts';

export type GeneratedApiCredential = {
	prefix: string;
	secret: string;
};

export function generateApiCredential(): GeneratedApiCredential {
	const prefix = randomBytes(API_CREDENTIAL_PREFIX_BYTES).toString('base64url');
	const secretMaterial = randomBytes(API_CREDENTIAL_SECRET_BYTES).toString('base64url');
	return {
		prefix,
		secret: `${API_CREDENTIAL_SCHEME}_${prefix}_${secretMaterial}`
	};
}

export function parseApiCredentialPrefix(secret: string): string | null {
	if (!API_CREDENTIAL_SECRET_PATTERN.test(secret)) return null;
	const prefixStart = API_CREDENTIAL_SCHEME.length + 1;
	return secret.slice(prefixStart, prefixStart + API_CREDENTIAL_PREFIX_LENGTH);
}

export function createApiCredentialVerifier(secret: string, pepper: string): string {
	return createHmac('sha256', pepper).update(secret, 'utf8').digest('hex');
}

export function verifyApiCredentialSecret(secret: string, expectedVerifier: string, pepper: string): boolean {
	const actual = Buffer.from(createApiCredentialVerifier(secret, pepper), 'hex');
	const expected = Buffer.from(expectedVerifier, 'hex');
	return expected.length === actual.length && timingSafeEqual(actual, expected);
}
