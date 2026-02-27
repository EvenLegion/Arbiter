import { z } from 'zod';

const decoder = new TextDecoder();

const RedisIntegerSchema = z
	.union([z.number().int(), z.string().regex(/^-?\d+$/), z.instanceof(Uint8Array).transform((value) => decoder.decode(value))])
	.transform((value) => (typeof value === 'number' ? value : Number.parseInt(value, 10)));

const RedisOptionalStringSchema = z
	.union([
		z.null(),
		z.undefined(),
		z.string(),
		z.number().transform((value) => String(value)),
		z.instanceof(Uint8Array).transform((value) => decoder.decode(value))
	])
	.transform((value) => (value === null || value === undefined ? null : value));

export function parseRedisInteger(value: unknown, label: string) {
	const parsed = RedisIntegerSchema.safeParse(value);
	if (!parsed.success) {
		throw new Error(`Invalid integer value for ${label}`);
	}

	return parsed.data;
}

export function parseRedisOptionalString(value: unknown, label: string) {
	const parsed = RedisOptionalStringSchema.safeParse(value);
	if (!parsed.success) {
		throw new Error(`Invalid string value for ${label}`);
	}

	return parsed.data;
}
