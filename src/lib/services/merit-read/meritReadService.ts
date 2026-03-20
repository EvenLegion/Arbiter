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

export async function loadInitialMeritList(deps: MeritReadServiceDeps, input: LoadInitialMeritListInput): Promise<LoadInitialMeritListResult> {
	const targetMember = await resolveInitialMeritListTarget(deps, input);
	if (targetMember.kind !== 'resolved') {
		return targetMember;
	}

	return {
		kind: 'loaded',
		targetMember: targetMember.member,
		summary: await loadMeritSummary({
			deps,
			discordUserId: targetMember.member.discordUserId,
			page: 1,
			pageSize: input.pageSize
		}),
		shouldReplyPrivately: input.actor.capabilities.isStaff ? (input.requestedPrivate ?? true) : true
	};
}

export async function loadMeritListPage(deps: MeritReadServiceDeps, input: LoadMeritListPageInput): Promise<LoadMeritListPageResult> {
	const targetMember = await deps.getMember({
		discordUserId: input.targetDiscordUserId
	});
	if (!targetMember || targetMember.isBot) {
		return {
			kind: 'target_not_found'
		};
	}

	return {
		kind: 'loaded',
		targetMember,
		summary: await loadMeritSummary({
			deps,
			discordUserId: targetMember.discordUserId,
			page: input.page,
			pageSize: input.pageSize
		})
	};
}

async function loadMeritSummary({
	deps,
	discordUserId,
	page,
	pageSize
}: {
	deps: MeritReadServiceDeps;
	discordUserId: string;
	page: number;
	pageSize: number;
}) {
	const targetDbUser = await deps.getUser({
		discordUserId
	});
	if (!targetDbUser) {
		return buildEmptyMeritSummary({
			page,
			pageSize
		});
	}

	return deps.getUserMeritSummary({
		userDbUserId: targetDbUser.id,
		page,
		pageSize
	});
}

async function resolveInitialMeritListTarget(deps: MeritReadServiceDeps, input: LoadInitialMeritListInput) {
	if (!input.requestedTargetDiscordUserId || input.requestedTargetDiscordUserId === input.requesterMember.discordUserId) {
		return {
			kind: 'resolved' as const,
			member: input.requesterMember
		};
	}

	if (!input.actor.capabilities.isStaff) {
		return {
			kind: 'forbidden_other_user' as const
		};
	}

	const targetMember = await deps.getMember({
		discordUserId: input.requestedTargetDiscordUserId
	});
	if (!targetMember || targetMember.isBot) {
		return {
			kind: 'target_not_found' as const
		};
	}

	return {
		kind: 'resolved' as const,
		member: targetMember
	};
}

function buildEmptyMeritSummary({ page, pageSize }: { page: number; pageSize: number }): UserMeritSummary {
	return {
		totalMerits: 0,
		totalAwards: 0,
		totalLinkedEvents: 0,
		page,
		pageSize,
		totalPages: 1,
		entries: []
	};
}
