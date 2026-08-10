import { describe, expect, it } from 'vitest';

import { buildPortalContentSecurityPolicy, parsePortalConfig } from './config';

describe('portal public configuration', () => {
	it('accepts one public HTTPS API origin and explicit local development origins', () => {
		expect(parsePortalConfig('https://api.arbiter.example')).toEqual({ apiBaseUrl: 'https://api.arbiter.example' });
		expect(parsePortalConfig('http://127.0.0.1:3000')).toEqual({ apiBaseUrl: 'http://127.0.0.1:3000' });
	});

	it('rejects secrets, paths, unrelated HTTP hosts, and local HTTP in production', () => {
		expect(() => parsePortalConfig('https://user:secret@api.example')).toThrow('only the API origin');
		expect(() => parsePortalConfig('https://api.example/v1')).toThrow('only the API origin');
		expect(() => parsePortalConfig('http://api.example')).toThrow('HTTPS');
		expect(() => parsePortalConfig('http://localhost:3000', true)).toThrow('HTTPS');
	});

	it('builds an exact-origin production content security policy', () => {
		const policy = buildPortalContentSecurityPolicy('https://api.arbiter.example');
		expect(policy).toContain('connect-src https://api.arbiter.example');
		expect(policy).not.toContain('ws:');
		expect(policy).toContain("frame-ancestors 'none'");
		expect(policy).not.toContain('https:;');
	});

	it('allows the fixed Vite HMR socket only in local development', () => {
		const policy = buildPortalContentSecurityPolicy('http://127.0.0.1:3000', false);
		expect(policy).toContain('connect-src http://127.0.0.1:3000 ws://127.0.0.1:4173');
	});
});
