import type { Guild, GuildMember } from 'discord.js';

import { meritRepository, userRepository } from '../../../../integrations/prisma/repositories';
import { getGuildMemberByDiscordUserId } from '../../../discord/members/memberDirectory';
import { loadInitialMeritList, loadMeritListPage } from '../../../services/merit-read/meritReadService';
import type { MeritReadMember } from '../../../services/merit-read/meritReadService';
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
	guild: Guild;
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
	guild: Guild;
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

function createMeritReadServiceDeps({ guild }: { guild: Guild }) {
	return {
		getMember: async ({ discordUserId }: { discordUserId: string }) => {
			const member = await getGuildMemberByDiscordUserId({
				guild,
				discordUserId
			});

			return member ? mapGuildMemberToMeritReadMember(member) : null;
		},
		getUser: userRepository.get,
		getUserMeritSummary: meritRepository.getUserMeritSummary
	};
}

function mapGuildMemberToMeritReadMember(member: GuildMember): MeritReadMember {
	return {
		discordUserId: member.id,
		displayName: member.displayName,
		isBot: member.user.bot
	};
}
