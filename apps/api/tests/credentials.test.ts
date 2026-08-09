import { describe, expect, it } from 'vitest';

import { createApiCredentialVerifier, generateApiCredential, parseApiCredentialPrefix, verifyApiCredentialSecret } from '../src/credentials/crypto';

const PEPPER = 'unit-test-credential-pepper-at-least-32-characters';

describe('API credential crypto', () => {
	it('generates high-entropy one-time credentials with a non-secret lookup prefix', () => {
		const first = generateApiCredential();
		const second = generateApiCredential();

		expect(first.secret).toMatch(/^arb_v1_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/);
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
