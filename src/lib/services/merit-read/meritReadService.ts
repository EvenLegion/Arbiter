import { loadMeritSummary } from './loadMeritSummary';
import { resolveInitialMeritListTarget } from './resolveInitialMeritListTarget';
import type {
	LoadInitialMeritListInput,
	LoadInitialMeritListResult,
	LoadMeritListPageInput,
	LoadMeritListPageResult,
	MeritReadServiceDeps
} from './meritReadTypes';

export type { MeritReadMember, LoadInitialMeritListResult, LoadMeritListPageResult } from './meritReadTypes';

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
