import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const CREDENTIAL_PREFIX = 'arb_v1';
const PREFIX_BYTES = 9;
const SECRET_BYTES = 32;
const CREDENTIAL_PATTERN = /^arb_v1_([A-Za-z0-9_-]{12})_[A-Za-z0-9_-]{43}$/;

export type GeneratedApiCredential = {
	prefix: string;
	secret: string;
};

export function generateApiCredential(): GeneratedApiCredential {
	const prefix = randomBytes(PREFIX_BYTES).toString('base64url');
	const secretMaterial = randomBytes(SECRET_BYTES).toString('base64url');
	return {
		prefix,
		secret: `${CREDENTIAL_PREFIX}_${prefix}_${secretMaterial}`
	};
}

export function parseApiCredentialPrefix(secret: string): string | null {
	return CREDENTIAL_PATTERN.exec(secret)?.[1] ?? null;
}

export function createApiCredentialVerifier(secret: string, pepper: string): string {
	return createHmac('sha256', pepper).update(secret, 'utf8').digest('hex');
}

export function verifyApiCredentialSecret(secret: string, expectedVerifier: string, pepper: string): boolean {
	const actual = Buffer.from(createApiCredentialVerifier(secret, pepper), 'hex');
	const expected = Buffer.from(expectedVerifier, 'hex');
	return expected.length === actual.length && timingSafeEqual(actual, expected);
}
