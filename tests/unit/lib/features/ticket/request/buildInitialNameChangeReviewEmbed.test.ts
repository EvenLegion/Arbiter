import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildInitialNameChangeReviewEmbed } from '../../../../../../src/lib/features/ticket/request/buildInitialNameChangeReviewEmbed';

describe('buildInitialNameChangeReviewEmbed', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2025-02-03T04:05:06.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('builds the initial pending review embed', () => {
		const embed = buildInitialNameChangeReviewEmbed({
			requestId: 19,
			requesterDiscordUserId: 'user-1',
			currentName: '  Current Name  ',
			requestedName: '  Requested Name  ',
			reason: '  Short reason  '
		});

		expect(embed.data.title).toBe('Name Change Request');
		expect(embed.data.fields?.find((field) => field.name === 'Requester')?.value).toBe('<@user-1>');
		expect(embed.data.fields?.find((field) => field.name === 'Current Name')?.value).toBe('Current Name');
		expect(embed.data.fields?.find((field) => field.name === 'Requested Name')?.value).toBe('Requested Name');
		expect(embed.data.fields?.find((field) => field.name === 'Reason')?.value).toBe('Short reason');
		expect(embed.data.fields?.find((field) => field.name === 'Status')?.value).toBe('Pending');
		expect(embed.data.footer?.text).toBe('Request ID: 19');
		expect(embed.data.timestamp).toBe('2025-02-03T04:05:06.000Z');
	});

	it('trims long field values to Discord-safe lengths', () => {
		const embed = buildInitialNameChangeReviewEmbed({
			requestId: 20,
			requesterDiscordUserId: 'user-2',
			currentName: `  ${'a'.repeat(120)}  `,
			requestedName: `  ${'b'.repeat(120)}  `,
			reason: `  ${'c'.repeat(1_020)}  `
		});

		expect(embed.data.fields?.find((field) => field.name === 'Current Name')?.value).toBe(`${'a'.repeat(97)}...`);
		expect(embed.data.fields?.find((field) => field.name === 'Requested Name')?.value).toBe(`${'b'.repeat(97)}...`);
		expect(embed.data.fields?.find((field) => field.name === 'Reason')?.value).toBe(`${'c'.repeat(997)}...`);
	});
});
