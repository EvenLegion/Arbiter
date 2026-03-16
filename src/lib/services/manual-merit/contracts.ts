import type { ActorContext } from '../_shared/actor';

export type { ResolvedManualMeritMember, AwardManualMeritWorkflowResult } from './manualMeritService';

export type AwardManualMeritWorkflowInput = {
	actor: ActorContext;
	actorMember: import('./manualMeritService').ResolvedManualMeritMember | null;
	playerInput: string;
	rawMeritTypeCode: string;
	reason: string | null;
	linkedEventSessionId: number | null;
};

export type ManualMeritServiceContract = {
	awardManualMerit: (input: AwardManualMeritWorkflowInput) => Promise<import('./manualMeritService').AwardManualMeritWorkflowResult>;
};
