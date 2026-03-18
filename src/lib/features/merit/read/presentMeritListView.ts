import { MessageFlags } from 'discord.js';

import type { LoadInitialMeritListResult, LoadMeritListPageResult } from '../../../services/merit-read/meritReadService';
import { buildMeritListPayload } from './buildMeritListPayload';

export type MeritListInitialView =
	| {
			delivery: 'fail';
			content: string;
			requestId?: boolean;
	  }
	| {
			delivery: 'reply';
			flags?: MessageFlags.Ephemeral;
			payload: ReturnType<typeof buildMeritListPayload>;
	  };

export type MeritListPageView =
	| {
			delivery: 'fail';
			content: string;
			requestId?: boolean;
	  }
	| {
			delivery: 'editReply';
			payload: ReturnType<typeof buildMeritListPayload>;
	  };

export function presentInitialMeritListView(result: LoadInitialMeritListResult): MeritListInitialView {
	if (result.kind === 'forbidden_other_user') {
		return {
			delivery: 'fail',
			content: 'Only staff can list merits for another user.'
		};
	}

	if (result.kind === 'target_not_found') {
		return {
			delivery: 'fail',
			content: 'Selected user was not found.'
		};
	}

	return {
		delivery: 'reply',
		...(result.shouldReplyPrivately ? { flags: MessageFlags.Ephemeral } : {}),
		payload: buildMeritListPayload({
			targetDiscordUserId: result.targetMember.discordUserId,
			targetDisplayName: result.targetMember.displayName,
			totalMerits: result.summary.totalMerits,
			totalLinkedEvents: result.summary.totalLinkedEvents,
			page: result.summary.page,
			totalPages: result.summary.totalPages,
			entries: result.summary.entries
		})
	};
}

export function presentMeritListPageView(result: LoadMeritListPageResult): MeritListPageView {
	if (result.kind === 'target_not_found') {
		return {
			delivery: 'fail',
			content: 'Selected user was not found.'
		};
	}

	return {
		delivery: 'editReply',
		payload: buildMeritListPayload({
			targetDiscordUserId: result.targetMember.discordUserId,
			targetDisplayName: result.targetMember.displayName,
			totalMerits: result.summary.totalMerits,
			totalLinkedEvents: result.summary.totalLinkedEvents,
			page: result.summary.page,
			totalPages: result.summary.totalPages,
			entries: result.summary.entries
		})
	};
}
