import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateOpaqueToken(): string {
	return randomBytes(32).toString('base64url');
}

export function isOpaqueToken(value: string | undefined): value is string {
	return value !== undefined && OPAQUE_TOKEN_PATTERN.test(value);
}

export function digestOpaqueToken(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function opaqueTokenMatches(value: string | undefined, expectedDigest: string): boolean {
	if (!isOpaqueToken(value) || !/^[a-f0-9]{64}$/.test(expectedDigest)) return false;
	const actual = Buffer.from(digestOpaqueToken(value), 'hex');
	const expected = Buffer.from(expectedDigest, 'hex');
	return timingSafeEqual(actual, expected);
}

export function opaqueTokensEqual(left: string | undefined, right: string): boolean {
	if (!isOpaqueToken(left) || !isOpaqueToken(right)) return false;
	return timingSafeEqual(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}
