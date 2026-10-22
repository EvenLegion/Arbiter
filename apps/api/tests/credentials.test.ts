import { describe, expect, it } from 'vitest';

import {
	API_CREDENTIAL_PREFIX_BYTES,
	API_CREDENTIAL_PREFIX_LENGTH,
	API_CREDENTIAL_SCHEME,
	API_CREDENTIAL_SECRET_BYTES,
	API_CREDENTIAL_SECRET_LENGTH,
	API_CREDENTIAL_SECRET_PATTERN
} from '@arbiter/api-contracts';

import { createApiCredentialVerifier, generateApiCredential, parseApiCredentialPrefix, verifyApiCredentialSecret } from '../src/credentials/crypto';

const PEPPER = 'unit-test-credential-pepper-at-least-32-characters';

describe('API credential crypto', () => {
	it('generates high-entropy one-time credentials with a non-secret lookup prefix', () => {
		const first = generateApiCredential();
		const second = generateApiCredential();
		const prefixStart = API_CREDENTIAL_SCHEME.length + 1;
		const secretStart = prefixStart + API_CREDENTIAL_PREFIX_LENGTH + 1;

		expect(first.secret).toMatch(API_CREDENTIAL_SECRET_PATTERN);
		expect(first.secret.slice(prefixStart, prefixStart + API_CREDENTIAL_PREFIX_LENGTH)).toHaveLength(API_CREDENTIAL_PREFIX_LENGTH);
		expect(first.secret.slice(secretStart)).toHaveLength(API_CREDENTIAL_SECRET_LENGTH);
		expect(API_CREDENTIAL_PREFIX_LENGTH).toBe(Math.ceil((API_CREDENTIAL_PREFIX_BYTES * 8) / 6));
		expect(API_CREDENTIAL_SECRET_LENGTH).toBe(Math.ceil((API_CREDENTIAL_SECRET_BYTES * 8) / 6));
		expect(parseApiCredentialPrefix(first.secret)).toBe(first.prefix);
		expect(first.secret).not.toBe(second.secret);
		expect(first.prefix).not.toBe(second.prefix);
	});

	it('uses a timing-safe HMAC verifier and rejects malformed or changed secrets', () => {
		const generated = generateApiCredential();
		const verifier = createApiCredentialVerifier(generated.secret, PEPPER);

		expect(verifier).toMatch(/^[a-f0-9]{64}$/);
		expect(verifier).not.toContain(generated.secret);
		expect(verifyApiCredentialSecret(generated.secret, verifier, PEPPER)).toBe(true);
		expect(verifyApiCredentialSecret(`${generated.secret}x`, verifier, PEPPER)).toBe(false);
		expect(parseApiCredentialPrefix('not-a-credential')).toBeNull();
	});
});
