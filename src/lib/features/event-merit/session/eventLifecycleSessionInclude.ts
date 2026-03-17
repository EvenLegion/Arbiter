export const EVENT_LIFECYCLE_SESSION_INCLUDE = {
	hostUser: true,
	eventTier: {
		include: {
			meritType: true
		}
	},
	channels: true,
	eventMessages: true
} as const;
