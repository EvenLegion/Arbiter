import { describe, expect, it } from 'vitest';

import { buildDivisionMembershipMutationReply } from '../../../../../../src/lib/features/staff/division-membership/buildDivisionMembershipMutationReply';

describe('buildDivisionMembershipMutationReply', () => {
	it('renders a successful add with updated nickname', () => {
		const reply = buildDivisionMembershipMutationReply({
			result: {
				kind: 'updated',
				mode: 'add',
				targetDiscordUserId: '123456789012345678',
				targetDbUserId: 'user-1',
				targetDiscordUsername: 'Alpha',
				divisionId: 1,
				divisionCode: 'NAVY',
				divisionName: 'Navy',
				changeCount: 1,
				nicknameSync: {
					kind: 'updated',
					computedNickname: '[NAVY] Alpha'
				}
			},
			requestId: 'req-1'
		});

		expect(reply).toContain('Added **Navy** to <@123456789012345678>');
		expect(reply).toContain('Nickname synced to `[NAVY] Alpha`');
		expect(reply).toContain('requestId=`req-1`');
	});

	it('renders a missing membership rejection', () => {
		const reply = buildDivisionMembershipMutationReply({
			result: {
				kind: 'membership_missing',
				targetDiscordUserId: '123456789012345678',
				divisionName: 'Support'
			},
			requestId: 'req-2'
		});

		expect(reply).toBe('<@123456789012345678> does not have the **Support** division membership. requestId=`req-2`');
	});
});
