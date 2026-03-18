import { loadInitialMeritList, loadMeritListPage } from '../../../services/merit-read/meritReadService';
import { createMeritReadServiceDeps, mapGuildMemberToMeritReadMember } from './createMeritReadServiceDeps';
import { presentInitialMeritListView, presentMeritListPageView, type MeritListInitialView, type MeritListPageView } from './presentMeritListView';

const MERIT_LIST_PAGE_SIZE = 5;

export async function loadInitialMeritListView({
	guild,
	actor,
	requesterMember,
	requestedTargetDiscordUserId,
	requestedPrivate,
	logger
}: {
	guild: Parameters<typeof createMeritReadServiceDeps>[0]['guild'];
	actor: Parameters<typeof loadInitialMeritList>[1]['actor'];
	requesterMember: Parameters<typeof mapGuildMemberToMeritReadMember>[0];
	requestedTargetDiscordUserId: string | null;
	requestedPrivate: boolean | null;
	logger: {
		error: (...values: readonly unknown[]) => void;
	};
}): Promise<MeritListInitialView> {
	try {
		const result = await loadInitialMeritList(createMeritReadServiceDeps({ guild }), {
			actor,
			requesterMember: mapGuildMemberToMeritReadMember(requesterMember),
			requestedTargetDiscordUserId,
			requestedPrivate,
			pageSize: MERIT_LIST_PAGE_SIZE
		});

		return presentInitialMeritListView(result);
	} catch (error) {
		logger.error(
			{
				err: error
			},
			'Failed to load initial merit list page'
		);
		return {
			delivery: 'fail',
			content: 'Failed to load merit summary. Please contact TECH with:',
			requestId: true
		};
	}
}

export async function loadMeritListPageView({
	guild,
	targetDiscordUserId,
	page,
	logger
}: {
	guild: Parameters<typeof createMeritReadServiceDeps>[0]['guild'];
	targetDiscordUserId: string;
	page: number;
	logger: {
		error: (...values: readonly unknown[]) => void;
	};
}): Promise<MeritListPageView> {
	try {
		const result = await loadMeritListPage(createMeritReadServiceDeps({ guild }), {
			targetDiscordUserId,
			page,
			pageSize: MERIT_LIST_PAGE_SIZE
		});

		return presentMeritListPageView(result);
	} catch (error) {
		logger.error(
			{
				err: error
			},
			'Failed to load merit list page'
		);
		return {
			delivery: 'fail',
			content: 'Failed to refresh merit summary. Please contact TECH with:',
			requestId: true
		};
	}
}
