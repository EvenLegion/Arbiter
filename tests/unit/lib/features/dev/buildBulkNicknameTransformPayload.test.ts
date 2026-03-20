import { describe, expect, it } from 'vitest';

import { buildBulkNicknameTransformPayload } from '../../../../../src/lib/features/dev/presenters/buildBulkNicknameTransformPayload';

describe('buildBulkNicknameTransformPayload', () => {
	it('builds a success summary for a clean run', () => {
		const payload = buildBulkNicknameTransformPayload({
			result: {
				kind: 'completed',
				scope: 'single',
				mode: 'reset',
				targetCount: 1,
				updated: 1,
				unchanged: 0,
				missingInGuild: 0,
				failed: 0,
				failures: []
			},
			requestId: 'req-1'
		});

		expect(payload.content).toContain('finished successfully');
		expect(payload.content).toContain('req-1');
		expect(payload.embeds).toHaveLength(1);
		expect(payload.embeds[0].data.title).toBe('Dev Nickname Command Complete');
		expect(payload.embeds[0].data.fields?.find((field) => field.name === 'Mode')?.value).toBe('reset');
	});

	it('includes a failure preview when there are unsuccessful targets', () => {
		const payload = buildBulkNicknameTransformPayload({
			result: {
				kind: 'completed',
				scope: 'all',
				mode: 'remove-suffix',
				targetCount: 3,
				updated: 1,
				unchanged: 0,
				missingInGuild: 1,
				failed: 1,
				failures: [
					{
						discordUserId: 'discord-user-1',
						discordUsername: 'Pilot',
						dbUserId: 'db-user-1',
						reason: 'Nickname edit failed'
					}
				]
			},
			requestId: 'req-2'
		});

		expect(payload.content).toContain('finished with issues');
		expect(payload.embeds[0].data.fields?.find((field) => field.name === 'Failure Preview')?.value).toContain('Nickname edit failed');
	});
});
