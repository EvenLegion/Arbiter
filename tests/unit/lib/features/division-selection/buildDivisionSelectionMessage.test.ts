import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../src/config/env/discord', () => ({
	ENV_DISCORD: {
		LGN_ROLE_ID: 'legion-role',
		NVY_ROLE_ID: 'navy-role',
		MRN_ROLE_ID: 'marines-role',
		SUP_ROLE_ID: 'support-role'
	}
}));

import { buildDivisionSelectionMessage } from '../../../../../src/lib/features/division-selection/presentation/buildDivisionSelectionMessage';

describe('buildDivisionSelectionMessage', () => {
	it('builds join buttons for selectable divisions and always includes leave division', () => {
		const message = buildDivisionSelectionMessage({
			divisions: [
				{
					id: 1,
					code: 'NVY',
					name: 'Navy',
					emojiId: 'emoji-1',
					emojiName: 'navy',
					discordRoleId: 'role-1'
				},
				{
					id: 2,
					code: 'LOG',
					name: 'Logistics',
					emojiId: null,
					emojiName: null,
					discordRoleId: 'role-2'
				}
			] as never
		});

		expect(message.embeds).toHaveLength(2);
		expect(message.embeds[0].title).toBe('DIVISION SELECTION');
		expect(message.components).toHaveLength(1);
		expect(message.components[0].components.map((component) => component.custom_id)).toEqual(['division:join:NVY', 'division:leave:any']);
	});
});
