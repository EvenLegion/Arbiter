import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

export default defineConfig({
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
});
