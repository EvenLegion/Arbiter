export function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value || value.length === 0) {
		throw new Error(`Missing required env var: ${name}`);
	}
	return value;
}

export function optionalEnv(name: string): string | undefined {
	const value = process.env[name];
	return value && value.length > 0 ? value : undefined;
}
