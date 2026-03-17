import type { UserMeritSummary } from '../../../integrations/prisma/repositories';
import type { ActorContext } from '../_shared/actor';

export type MeritReadMember = {
	discordUserId: string;
	displayName: string;
	isBot: boolean;
};

export type MeritReadServiceDeps = {
	getMember: (params: { discordUserId: string }) => Promise<MeritReadMember | null>;
	getUser: (params: { discordUserId: string }) => Promise<{ id: string } | null>;
	getUserMeritSummary: (params: { userDbUserId: string; page: number; pageSize: number }) => Promise<UserMeritSummary>;
};

export type LoadInitialMeritListInput = {
	actor: ActorContext;
	requesterMember: MeritReadMember;
	requestedTargetDiscordUserId: string | null;
	requestedPrivate: boolean | null;
	pageSize: number;
};

export type LoadMeritListPageInput = {
	targetDiscordUserId: string;
	page: number;
	pageSize: number;
};

export type LoadInitialMeritListResult =
	| { kind: 'forbidden_other_user' }
	| { kind: 'target_not_found' }
	| {
			kind: 'loaded';
			targetMember: MeritReadMember;
			summary: UserMeritSummary;
			shouldReplyPrivately: boolean;
	  };

export type LoadMeritListPageResult =
	| { kind: 'target_not_found' }
	| {
			kind: 'loaded';
			targetMember: MeritReadMember;
			summary: UserMeritSummary;
	  };
