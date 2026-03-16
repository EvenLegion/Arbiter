export type { DivisionMembershipMutationMode, DivisionMembershipMutationResult } from './divisionMembershipService';

export type DivisionMembershipMutationInput = {
	mode: import('./divisionMembershipService').DivisionMembershipMutationMode;
	targetDiscordUserId: string;
	divisionSelection: string;
	syncNickname: boolean;
};

export type DivisionMembershipServiceContract = {
	applyMutation: (input: DivisionMembershipMutationInput) => Promise<import('./divisionMembershipService').DivisionMembershipMutationResult>;
};
