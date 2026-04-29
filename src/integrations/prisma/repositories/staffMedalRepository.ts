import {
	findEventAttendeeUserByDiscordUserId,
	findEventAttendeeUsers,
	findEventMeritRecipientUsers,
	findRecentMedalEventById,
	findRecentMedalEvents,
	findStandaloneMedalEligibleUserByDiscordUserId,
	findStandaloneMedalEligibleUsers
} from '../staff/medal/read';

export const staffMedalRepository = {
	listRecentEvents: findRecentMedalEvents,
	getRecentEventById: findRecentMedalEventById,
	listEventAttendees: findEventAttendeeUsers,
	getEventAttendeeByDiscordUserId: findEventAttendeeUserByDiscordUserId,
	listEventMeritRecipients: findEventMeritRecipientUsers,
	listStandaloneEligibleUsers: findStandaloneMedalEligibleUsers,
	getStandaloneEligibleUserByDiscordUserId: findStandaloneMedalEligibleUserByDiscordUserId
};
