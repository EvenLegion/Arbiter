import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DISCORD_MAX_NICKNAME_LENGTH } from '../../../../../../src/lib/constants';
import {
	buildEditedNameChangeEmbed,
	buildNameChangeReviewActionRow,
	buildNameChangeReviewEditModal,
	buildReviewedNameChangeEmbed,
	NAME_CHANGE_REVIEW_EDIT_MODAL_REQUESTED_NAME_INPUT_ID
} from '../../../../../../src/lib/features/ticket/review/presentation/nameChangeReviewPresentation';
import {
	buildNameChangeReviewButtonCustomId,
	buildNameChangeReviewEditModalCustomId
} from '../../../../../../src/lib/features/ticket/review/nameChangeReviewCustomId';

describe('nameChangeReviewPresentation', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2025-03-04T05:06:07.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('builds approve, deny, and edit controls for a review request', () => {
		const row = buildNameChangeReviewActionRow({
			requestId: 28,
			disabled: true
		});

		expect(row.components.map((component) => component.data.label)).toEqual(['Approve', 'Deny', 'Edit Name']);
		expect(row.components.map((component) => component.data.custom_id)).toEqual([
			buildNameChangeReviewButtonCustomId({ requestId: 28, action: 'approve' }),
			buildNameChangeReviewButtonCustomId({ requestId: 28, action: 'deny' }),
			buildNameChangeReviewButtonCustomId({ requestId: 28, action: 'edit' })
		]);
		expect(row.components.every((component) => component.data.disabled)).toBe(true);
	});

	it('builds an edit modal that caps the requested name to the Discord nickname limit', () => {
		const modal = buildNameChangeReviewEditModal({
			requestId: 29,
			requestedName: 'x'.repeat(80)
		});

		expect(modal.data.custom_id).toBe(buildNameChangeReviewEditModalCustomId({ requestId: 29 }));
		expect(modal.data.title).toBe('Edit Name Request');
		expect(modal.components).toHaveLength(1);
		const input = modal.components[0].components[0];
		expect(input.data.custom_id).toBe(NAME_CHANGE_REVIEW_EDIT_MODAL_REQUESTED_NAME_INPUT_ID);
		expect(input.data.max_length).toBe(DISCORD_MAX_NICKNAME_LENGTH);
		expect(input.data.value).toBe('x'.repeat(DISCORD_MAX_NICKNAME_LENGTH));
	});

	it('updates existing review embeds with the final status and reviewer mention', () => {
		const embed = buildReviewedNameChangeEmbed({
			existingEmbed: {
				title: 'Name Change Request',
				fields: [
					{
						name: 'Status',
						value: 'Pending',
						inline: true
					},
					{
						name: 'Requester',
						value: '<@user-1>',
						inline: false
					}
				]
			},
			statusLabel: 'Approved',
			reviewerDiscordUserId: 'staff-1'
		});

		expect(embed.data.fields?.find((field) => field.name === 'Status')?.value).toBe('Approved');
		expect(embed.data.fields?.find((field) => field.name === 'Reviewed By')?.value).toBe('<@staff-1>');
		expect(embed.data.color).toBe(0x22c55e);
		expect(embed.data.timestamp).toBe('2025-03-04T05:06:07.000Z');
	});

	it('creates a fallback review embed when there is no existing message embed', () => {
		const embed = buildReviewedNameChangeEmbed({
			existingEmbed: undefined,
			statusLabel: 'Denied',
			reviewerDiscordUserId: 'staff-2'
		});

		expect(embed.data.title).toBe('Name Change Request');
		expect(embed.data.fields?.find((field) => field.name === 'Status')?.value).toBe('Denied');
		expect(embed.data.fields?.find((field) => field.name === 'Reviewed By')?.value).toBe('<@staff-2>');
		expect(embed.data.color).toBe(0xef4444);
	});

	it('updates the requested name in an existing embed and trims long values', () => {
		const embed = buildEditedNameChangeEmbed({
			existingEmbed: {
				title: 'Name Change Request',
				fields: [
					{
						name: 'Requested Name',
						value: 'Old Name',
						inline: false
					}
				]
			},
			requestedName: `  ${'n'.repeat(120)}  `
		});

		expect(embed.data.fields?.find((field) => field.name === 'Requested Name')?.value).toBe(`${'n'.repeat(97)}...`);
		expect(embed.data.timestamp).toBe('2025-03-04T05:06:07.000Z');
	});

	it('creates a fallback embed when a requested name edit arrives before the original embed is available', () => {
		const embed = buildEditedNameChangeEmbed({
			existingEmbed: undefined,
			requestedName: '  Updated Name  '
		});

		expect(embed.data.title).toBe('Name Change Request');
		expect(embed.data.fields?.find((field) => field.name === 'Requested Name')?.value).toBe('Updated Name');
	});
});
