import { fileURLToPath } from 'node:url';

import { defineConfig, loadEnv } from 'vite';

import { buildPortalContentSecurityPolicy } from './src/config';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), 'VITE_');
	const apiBaseUrl = mode === 'test' ? 'https://api.test.invalid' : env.VITE_API_BASE_URL;
	const contentSecurityPolicy = buildPortalContentSecurityPolicy(apiBaseUrl, mode === 'production');
	return {
		plugins: [
			{
				name: 'arbiter-portal-security-policy',
				transformIndexHtml: {
					order: 'pre',
					handler(html) {
						return html.replace(
							'<meta name="viewport"',
							`<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}">\n    <meta name="viewport"`
						);
					}
				}
			}
		],
		resolve: {
			alias: {
				'@arbiter/api-contracts': fileURLToPath(new URL('../../packages/api-contracts/src/index.ts', import.meta.url))
			}
		},
		server: {
			host: '127.0.0.1',
			port: 4173,
			strictPort: true
		},
		preview: {
			host: '127.0.0.1',
			port: 4173,
			strictPort: true
		},
		build: {
			outDir: 'dist',
			emptyOutDir: true,
			sourcemap: false
		}
	};
});
