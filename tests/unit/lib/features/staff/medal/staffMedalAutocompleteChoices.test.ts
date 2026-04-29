import { DivisionKind } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	meritRepository: {
		getUsersTotalMerits: vi.fn()
	},
	staffMedalRepository: {
		getRecentEventById: vi.fn(),
		listEventAttendees: vi.fn()
	},
	buildUserNickname: vi.fn(),
	isNicknameTooLongError: vi.fn()
}));

vi.mock('../../../../../../src/lib/services/nickname/buildUserNickname', () => ({
	buildUserNickname: mocks.buildUserNickname,
	isNicknameTooLongError: mocks.isNicknameTooLongError
}));

vi.mock('../../../../../../src/integrations/prisma/repositories', () => ({
	meritRepository: mocks.meritRepository,
	staffMedalRepository: mocks.staffMedalRepository
}));

import { buildEventAttendeeAutocompleteChoices } from '../../../../../../src/lib/features/staff/medal/staffMedalAutocompleteChoices';

describe('staffMedalAutocompleteChoices', () => {
	beforeEach(() => {
		mocks.meritRepository.getUsersTotalMerits.mockReset();
		mocks.staffMedalRepository.getRecentEventById.mockReset();
		mocks.staffMedalRepository.listEventAttendees.mockReset();
		mocks.buildUserNickname.mockReset();
		mocks.isNicknameTooLongError.mockReset();
		mocks.buildUserNickname.mockImplementation(({ baseNickname }: { baseNickname: string }) => ({
			newUserNickname: baseNickname
		}));
		mocks.isNicknameTooLongError.mockReturnValue(false);
	});

	it('returns no attendee suggestions when the selected event is not a recent eligible medal event', async () => {
		mocks.staffMedalRepository.getRecentEventById.mockResolvedValue(null);

		await expect(
			buildEventAttendeeAutocompleteChoices({
				eventSessionId: 999,
				query: 'res'
			})
		).resolves.toEqual([]);

		expect(mocks.staffMedalRepository.listEventAttendees).not.toHaveBeenCalled();
		expect(mocks.meritRepository.getUsersTotalMerits).not.toHaveBeenCalled();
	});

	it('loads attendee suggestions for recent eligible medal events', async () => {
		mocks.staffMedalRepository.getRecentEventById.mockResolvedValue({
			id: 123,
			name: 'Recent Event',
			createdAt: new Date(),
			state: 'FINALIZED_WITH_MERITS',
			channels: [],
			eventTier: {
				name: 'Tier 1'
			}
		});
		mocks.staffMedalRepository.listEventAttendees.mockResolvedValue([
			{
				user: {
					id: 'db-1',
					discordUserId: '1',
					discordUsername: 'spacesailor',
					discordNickname: 'Spacesailor',
					divisionMemberships: [
						{
							division: {
								id: 1,
								code: 'RES',
								name: 'Reserve',
								displayNamePrefix: 'RES',
								kind: DivisionKind.RESERVE,
								showRank: true,
								discordRoleId: 'role-1',
								emojiId: null,
								emojiName: null,
								createdAt: new Date(),
								updatedAt: new Date()
							}
						}
					]
				}
			}
		]);
		mocks.meritRepository.getUsersTotalMerits.mockResolvedValue(new Map([['db-1', 0]]));
		mocks.buildUserNickname.mockReturnValue({
			newUserNickname: 'RES | Spacesailor'
		});

		await expect(
			buildEventAttendeeAutocompleteChoices({
				eventSessionId: 123,
				query: 'res'
			})
		).resolves.toEqual([
			{
				name: 'RES | Spacesailor',
				value: '1'
			}
		]);

		expect(mocks.staffMedalRepository.listEventAttendees).toHaveBeenCalledWith({
			eventSessionId: 123,
			query: 'res',
			limit: 25
		});
	});

	it('rethrows unexpected nickname computation errors', async () => {
		mocks.staffMedalRepository.getRecentEventById.mockResolvedValue({
			id: 123,
			name: 'Recent Event',
			createdAt: new Date(),
			state: 'FINALIZED_WITH_MERITS',
			channels: [],
			eventTier: {
				name: 'Tier 1'
			}
		});
		mocks.staffMedalRepository.listEventAttendees.mockResolvedValue([
			{
				user: {
					id: 'db-1',
					discordUserId: '1',
					discordUsername: 'spacesailor',
					discordNickname: 'Spacesailor',
					divisionMemberships: []
				}
			}
		]);
		mocks.meritRepository.getUsersTotalMerits.mockResolvedValue(new Map([['db-1', 0]]));
		const unexpectedError = new Error('boom');
		mocks.buildUserNickname.mockImplementation(() => {
			throw unexpectedError;
		});
		mocks.isNicknameTooLongError.mockReturnValue(false);

		await expect(
			buildEventAttendeeAutocompleteChoices({
				eventSessionId: 123,
				query: ''
			})
		).rejects.toThrow('boom');
	});
});
