export type {
	MeritReadMember,
	LoadInitialMeritListResult,
	LoadMeritListPageResult,
	LoadInitialMeritListInput,
	LoadMeritListPageInput
} from './meritReadTypes';

export type MeritReadServiceContract = {
	loadInitialList: (input: import('./meritReadTypes').LoadInitialMeritListInput) => Promise<import('./meritReadTypes').LoadInitialMeritListResult>;
	loadPage: (input: import('./meritReadTypes').LoadMeritListPageInput) => Promise<import('./meritReadTypes').LoadMeritListPageResult>;
};
