import { join } from 'path';

export const rootDir = join(__dirname, '..', '..');
export const srcDir = join(rootDir, 'src');
export const DISCORD_MAX_NICKNAME_LENGTH = 32;

/** Discord choice values and persisted expectedEventDuration are whole minutes. */
export const EXPECTED_EVENT_DURATION_CHOICES = [
	{ name: '1 hour', value: 60 },
	{ name: '1.5 hours', value: 90 },
	{ name: '2 hours', value: 120 },
	{ name: '2.5 hours', value: 150 },
	{ name: '3 hours', value: 180 }
] as const;

export function isExpectedEventDurationMinutes(value: unknown): value is number {
	return EXPECTED_EVENT_DURATION_CHOICES.some((choice) => choice.value === value);
}
