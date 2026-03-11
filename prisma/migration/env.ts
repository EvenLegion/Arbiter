import 'dotenv/config';

function readEnv(name: string): string | undefined {
	const raw = process.env[name];
	if (typeof raw !== 'string') {
		return undefined;
	}

	const value = raw.trim();
	return value.length > 0 ? value : undefined;
}

export function requiredEnv(name: string | string[]): string {
	const names = Array.isArray(name) ? name : [name];
	for (const candidate of names) {
		const value = readEnv(candidate);
		if (value) {
			return value;
		}
	}

	throw new Error(`Missing required env var. Set one of: ${names.join(', ')}`);
}

export function redactConnectionString(connectionString: string): string {
	try {
		const parsed = new URL(connectionString);
		const auth = parsed.username ? `${parsed.username}:***@` : '';
		return `${parsed.protocol}//${auth}${parsed.host}${parsed.pathname}`;
	} catch {
		return '<redacted>';
	}
}
