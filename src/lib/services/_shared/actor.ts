export type ActorCapabilities = {
	isStaff: boolean;
	isCenturion: boolean;
	isOptio: boolean;
};

export type ActorContext = {
	discordUserId: string;
	dbUserId: string | null;
	capabilities: ActorCapabilities;
	discordTag?: string;
};

export function hasCenturionEquivalentCapability(capabilities: Pick<ActorCapabilities, 'isCenturion' | 'isOptio'>) {
	return capabilities.isCenturion || capabilities.isOptio;
}

export function hasStaffOrCenturionEquivalentCapability(capabilities: ActorCapabilities) {
	return capabilities.isStaff || hasCenturionEquivalentCapability(capabilities);
}
