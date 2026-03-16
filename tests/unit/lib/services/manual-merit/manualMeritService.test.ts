import { MeritTypeCode } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { awardManualMeritWorkflow } from '../../../../../src/lib/services/manual-merit/manualMeritService';

describe('manualMeritService', () => {
	it('awards manual merit successfully without warnings', async () => {
		const deps = createDeps();

		const result = await awardManualMeritWorkflow(deps, {
			actor: createActor(),
			actorMember: buildMember('staff-user'),
			playerInput: 'target-user',
			rawMeritTypeCode: MeritTypeCode.COMMANDER_MERIT,
			reason: 'Hosted training',
			linkedEventSessionId: 55
		});

		expect(result).toEqual({
			kind: 'awarded',
			meritRecordId: 99,
			targetDiscordUserId: 'target-user',
			meritTypeCode: MeritTypeCode.COMMANDER_MERIT,
			meritTypeName: 'Commander Merit',
			meritAmount: 1,
			linkedEventName: 'Training Op',
			reason: 'Hosted training',
			dmSent: true,
			recipientNicknameTooLong: false
		});
	});

	it('surfaces a nickname warning without failing the workflow', async () => {
		const deps = createDeps();
		deps.syncRecipientNickname.mockResolvedValueOnce('nickname-too-long');

		const result = await awardManualMeritWorkflow(deps, {
			actor: createActor(),
			actorMember: buildMember('staff-user'),
			playerInput: 'target-user',
			rawMeritTypeCode: MeritTypeCode.COMMANDER_MERIT,
			reason: 'Hosted training',
			linkedEventSessionId: 55
		});

		expect(result).toEqual({
			kind: 'awarded',
			meritRecordId: 99,
			targetDiscordUserId: 'target-user',
			meritTypeCode: MeritTypeCode.COMMANDER_MERIT,
			meritTypeName: 'Commander Merit',
			meritAmount: 1,
			linkedEventName: 'Training Op',
			reason: 'Hosted training',
			dmSent: true,
			recipientNicknameTooLong: true
		});
	});

	it('surfaces a DM warning without failing the workflow', async () => {
		const deps = createDeps();
		deps.sendRecipientDm.mockResolvedValueOnce(false);

		const result = await awardManualMeritWorkflow(deps, {
			actor: createActor(),
			actorMember: buildMember('staff-user'),
			playerInput: 'target-user',
			rawMeritTypeCode: MeritTypeCode.COMMANDER_MERIT,
			reason: 'Hosted training',
			linkedEventSessionId: 55
		});

		expect(result).toEqual({
			kind: 'awarded',
			meritRecordId: 99,
			targetDiscordUserId: 'target-user',
			meritTypeCode: MeritTypeCode.COMMANDER_MERIT,
			meritTypeName: 'Commander Merit',
			meritAmount: 1,
			linkedEventName: 'Training Op',
			reason: 'Hosted training',
			dmSent: false,
			recipientNicknameTooLong: false
		});
		expect(deps.notifyRankUp).toHaveBeenCalledWith({
			discordUserId: 'target-user',
			previousTotalMerits: 11,
			currentTotalMerits: 12
		});
	});

	it('returns linked_event_not_found when the selected event does not exist', async () => {
		const deps = createDeps({
			findLinkedEventResult: null
		});

		await expect(
			awardManualMeritWorkflow(deps, {
				actor: createActor(),
				actorMember: buildMember('staff-user'),
				playerInput: 'target-user',
				rawMeritTypeCode: MeritTypeCode.COMMANDER_MERIT,
				reason: null,
				linkedEventSessionId: 55
			})
		).resolves.toEqual({
			kind: 'linked_event_not_found'
		});
		expect(deps.awardManualMerit).not.toHaveBeenCalled();
	});

	it('returns linked_event_too_old when the linked event is outside the allowed window', async () => {
		const deps = createDeps({
			findLinkedEventResult: {
				id: 55,
				name: 'Old Op',
				createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1_000)
			}
		});

		await expect(
			awardManualMeritWorkflow(deps, {
				actor: createActor(),
				actorMember: buildMember('staff-user'),
				playerInput: 'target-user',
				rawMeritTypeCode: MeritTypeCode.COMMANDER_MERIT,
				reason: null,
				linkedEventSessionId: 55
			})
		).resolves.toEqual({
			kind: 'linked_event_too_old'
		});
		expect(deps.awardManualMerit).not.toHaveBeenCalled();
	});

	it('returns a typed branch when the merit type is not manual-awardable', async () => {
		const deps = createDeps();
		const error = new Error('not manual-awardable');
		error.name = 'MeritTypeNotManualAwardableError';
		deps.awardManualMerit.mockRejectedValueOnce(error);

		await expect(
			awardManualMeritWorkflow(deps, {
				actor: createActor(),
				actorMember: buildMember('staff-user'),
				playerInput: 'target-user',
				rawMeritTypeCode: MeritTypeCode.TIER_2,
				reason: null,
				linkedEventSessionId: null
			})
		).resolves.toEqual({
			kind: 'merit_type_not_manual_awardable'
		});
	});
});

function createActor() {
	return {
		discordUserId: 'staff-user',
		dbUserId: 'staff-db-user',
		capabilities: {
			isStaff: true,
			isCenturion: false
		}
	};
}

function buildMember(discordUserId: string) {
	return {
		discordUserId,
		discordUsername: `${discordUserId}-name`,
		discordDisplayName: `${discordUserId}-display`,
		discordGlobalName: `${discordUserId}-global`,
		discordAvatarUrl: `https://example.com/${discordUserId}.png`,
		isBot: false
	};
}

function createDeps({
	linkedEventSessionId = 55,
	findLinkedEventResult = {
		id: 55,
		name: 'Training Op',
		createdAt: new Date()
	}
}: {
	linkedEventSessionId?: number;
	findLinkedEventResult?: { id: number; name: string; createdAt: Date } | null;
} = {}) {
	return {
		resolveTargetMember: vi.fn().mockImplementation(async (playerInput: string) => buildMember(playerInput)),
		upsertUser: vi.fn().mockResolvedValue({
			id: 'db-user-id'
		}),
		findLinkedEvent: vi
			.fn()
			.mockImplementation(async (eventSessionId: number) => (eventSessionId === linkedEventSessionId ? findLinkedEventResult : null)),
		awardManualMerit: vi.fn().mockResolvedValue({
			id: 99,
			meritType: {
				code: MeritTypeCode.COMMANDER_MERIT,
				name: 'Commander Merit',
				meritAmount: 1
			}
		}),
		syncRecipientNickname: vi.fn().mockResolvedValue('ok'),
		computeAwarderNickname: vi.fn().mockResolvedValue('Staff Display'),
		getRecipientTotalMerits: vi.fn().mockResolvedValue(12),
		notifyRankUp: vi.fn().mockResolvedValue(undefined),
		sendRecipientDm: vi.fn().mockResolvedValue(true)
	};
}
