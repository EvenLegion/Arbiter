export type ActorContext = {
	discordUserId: string;
	dbUserId: string | null;
	capabilities: {
		isStaff: boolean;
		isCenturion: boolean;
	};
	discordTag?: string;
};
