import { resolve } from 'node:path';
import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createApiLogger, resolveApiLogFilePath } from '../src/logger';

describe('API logger', () => {
	it('redacts sensitive values from structured logs', () => {
		let output = '';
		const destination = new Writable({
			write(chunk, _encoding, callback) {
				output += chunk.toString();
				callback();
			}
		});
		const logger = createApiLogger({ logLevel: 'info', logFilePath: 'unused.log', consoleLogLevel: 'silent', nodeEnv: 'test' }, destination);
		logger.info(
			{
				authorization: 'Bearer secret-token',
				headers: { 'x-csrf-token': 'csrf-header-value', 'set-cookie': 'arbiter_session=session-cookie-value' },
				req: {
					headers: {
						'x-csrf-token': 'nested-csrf-header-value',
						'set-cookie': 'arbiter_session=nested-session-cookie-value'
					}
				},
				config: {
					databaseUrl: 'postgresql://secret',
					credentialPepper: 'pepper-secret',
					auth: { discordClientSecret: 'discord-client-secret' },
					API_CREDENTIAL_PEPPER: 'env-credential-pepper',
					API_DISCORD_CLIENT_SECRET: 'env-discord-client-secret'
				},
				verifier: 'stored-digest-secret',
				credential: { verifier: 'nested-verifier-secret', secret: 'one-time-secret' },
				oauth: {
					access_token: 'oauth-access-token',
					refresh_token: 'oauth-refresh-token',
					csrfToken: 'csrf-token-value',
					sessionId: 'session-id-value',
					bindingId: 'binding-id-value',
					oauthCode: 'oauth-code-value',
					oauthState: 'oauth-state-value'
				}
			},
			'redaction test'
		);

		expect(output).toContain('"app":"arbiter"');
		expect(output).toContain('"service":"arbiter-api"');
		expect(output).toContain('[REDACTED]');
		expect(output).not.toContain('secret-token');
		expect(output).not.toContain('postgresql://secret');
		expect(output).not.toContain('pepper-secret');
		expect(output).not.toContain('stored-digest-secret');
		expect(output).not.toContain('nested-verifier-secret');
		expect(output).not.toContain('one-time-secret');
		expect(output).not.toContain('discord-client-secret');
		expect(output).not.toContain('oauth-access-token');
		expect(output).not.toContain('oauth-refresh-token');
		expect(output).not.toContain('csrf-token-value');
		expect(output).not.toContain('session-id-value');
		expect(output).not.toContain('binding-id-value');
		expect(output).not.toContain('oauth-code-value');
		expect(output).not.toContain('oauth-state-value');
		expect(output).not.toContain('csrf-header-value');
		expect(output).not.toContain('session-cookie-value');
		expect(output).not.toContain('nested-csrf-header-value');
		expect(output).not.toContain('nested-session-cookie-value');
		expect(output).not.toContain('env-credential-pepper');
		expect(output).not.toContain('env-discord-client-secret');
	});

	it('anchors relative file destinations at the repository root for Alloy', () => {
		expect(resolveApiLogFilePath('logs/api.log')).toBe(resolve(__dirname, '../../../logs/api.log'));
		expect(resolveApiLogFilePath('/var/log/arbiter/api.log')).toBe('/var/log/arbiter/api.log');
	});
});
