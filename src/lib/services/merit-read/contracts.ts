import type { ActorContext } from '../_shared/actor';

export type { MeritReadMember, LoadInitialMeritListResult, LoadMeritListPageResult } from './meritReadService';

export type LoadInitialMeritListInput = {
	actor: ActorContext;
	requesterMember: import('./meritReadService').MeritReadMember;
	requestedTargetDiscordUserId: string | null;
	requestedPrivate: boolean | null;
	pageSize: number;
};

export type LoadMeritListPageInput = {
	targetDiscordUserId: string;
	page: number;
	pageSize: number;
};

export type MeritReadServiceContract = {
	loadInitialList: (input: LoadInitialMeritListInput) => Promise<import('./meritReadService').LoadInitialMeritListResult>;
	loadPage: (input: LoadMeritListPageInput) => Promise<import('./meritReadService').LoadMeritListPageResult>;
};
