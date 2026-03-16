import { NameChangeRequestStatus } from '@prisma/client';

export type PendingNameChangeRequest = {
	id: number;
	status: NameChangeRequestStatus;
	requestedName: string;
	requesterUser: {
		discordUserId: string;
	};
};

type ReviewedNameChangeStatus = Extract<NameChangeRequestStatus, 'APPROVED' | 'DENIED'>;

export type ReviewedNameChangeRequest = PendingNameChangeRequest & {
	status: ReviewedNameChangeStatus;
};

export type NameChangeReviewThreadPayload = {
	requestId: number;
	requesterDiscordUserId: string;
	requesterTag: string;
	currentName: string;
	requestedName: string;
	reason: string;
};

export type NameChangeRequester = {
	dbUserId: string;
	currentName: string;
};
