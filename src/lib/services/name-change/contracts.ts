import type { ActorContext } from '../_shared/actor';

export type {
	PendingNameChangeRequest,
	ReviewedNameChangeRequest,
	NameChangeReviewThreadPayload,
	SubmitNameChangeRequestResult,
	GetPendingNameChangeRequestForEditResult,
	EditPendingNameChangeRequestResult,
	ReviewNameChangeDecisionResult
} from './nameChangeService';

export type SubmitNameChangeRequestInput = {
	actor: ActorContext;
	rawRequestedName: string;
	reason: string;
	requesterTag: string;
};

export type GetPendingNameChangeRequestForEditInput = {
	actor: ActorContext;
	requestId: number;
};

export type EditPendingNameChangeRequestInput = {
	actor: ActorContext;
	requestId: number;
	rawRequestedName: string;
};

export type ReviewNameChangeDecisionInput = {
	actor: ActorContext;
	requestId: number;
	decision: 'approve' | 'deny';
};

export type NameChangeServiceContract = {
	submitRequest: (input: SubmitNameChangeRequestInput) => Promise<import('./nameChangeService').SubmitNameChangeRequestResult>;
	getPendingRequestForEdit: (
		input: GetPendingNameChangeRequestForEditInput
	) => Promise<import('./nameChangeService').GetPendingNameChangeRequestForEditResult>;
	editPendingRequest: (input: EditPendingNameChangeRequestInput) => Promise<import('./nameChangeService').EditPendingNameChangeRequestResult>;
	reviewRequest: (input: ReviewNameChangeDecisionInput) => Promise<import('./nameChangeService').ReviewNameChangeDecisionResult>;
};
