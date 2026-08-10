export type PortalConfig = {
	apiBaseUrl: string;
};

export function parsePortalConfig(value: unknown, production = false): PortalConfig {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error('VITE_API_BASE_URL is required');
	}

	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error('VITE_API_BASE_URL must be an absolute URL');
	}

	if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
		throw new Error('VITE_API_BASE_URL must contain only the API origin');
	}
	const localHttp = url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
	if (url.protocol !== 'https:' && (!localHttp || production)) {
		throw new Error('VITE_API_BASE_URL must use HTTPS outside local development');
	}

	return { apiBaseUrl: url.origin };
}

export function loadPortalConfig(): PortalConfig {
	return parsePortalConfig(import.meta.env.VITE_API_BASE_URL, import.meta.env.PROD);
}

export function buildPortalContentSecurityPolicy(apiBaseUrl: unknown, production = true): string {
	const config = parsePortalConfig(apiBaseUrl, production);
	const connectSources = production ? config.apiBaseUrl : `${config.apiBaseUrl} ws://127.0.0.1:4173`;
	return [
		"default-src 'self'",
		"base-uri 'none'",
		`connect-src ${connectSources}`,
		"font-src 'self'",
		"form-action 'none'",
		"frame-ancestors 'none'",
		"img-src 'self' data: https://cdn.discordapp.com",
		"object-src 'none'",
		"script-src 'self'",
		"style-src 'self'"
	].join('; ');
}
