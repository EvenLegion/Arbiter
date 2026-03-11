import { Utility } from '@sapphire/plugin-utilities-store';
import type { Guild, GuildMember } from 'discord.js';

import { buildUserNickname } from '../lib/features/guild-member/buildUserNickname';
import { createChildExecutionContext, type ExecutionContext } from '../lib/logging/executionContext';

type GetOrThrowParams = {
	guild?: Guild;
	discordUserId: string;
};

type GetParams = GetOrThrowParams;

type ListAllParams = {
	guild?: Guild;
};

type SyncComputedNicknameParams = {
	member: GuildMember;
	context: ExecutionContext;
	setReason?: string;
	totalMeritsOverride?: number;
	contextBindings?: Record<string, unknown>;
};

type ComputeNicknameParams = {
	member: GuildMember;
	context: ExecutionContext;
	totalMeritsOverride?: number;
	contextBindings?: Record<string, unknown>;
	baseDiscordNicknameOverride?: string;
};

type ComputeNicknameResult = {
	computedNickname: string | null;
	reason: string | undefined;
};

type SyncComputedNicknameResult =
	| {
			outcome: 'skipped';
			member: GuildMember;
			computedNickname: null;
			reason: string | undefined;
	  }
	| {
			outcome: 'unchanged' | 'updated';
			member: GuildMember;
			computedNickname: string;
			reason?: undefined;
	  };

export class MemberUtility extends Utility {
	public constructor(context: Utility.LoaderContext, options: Utility.Options) {
		super(context, {
			...options,
			name: 'member'
		});
	}

	public async get({ guild, discordUserId }: GetParams): Promise<GuildMember | null> {
		const resolvedGuild = guild ?? (await this.container.utilities.guild.getOrThrow());
		const cachedMember = resolvedGuild.members.cache.get(discordUserId);
		if (cachedMember) {
			return cachedMember;
		}

		return resolvedGuild.members.fetch(discordUserId).catch((error: unknown) => {
			if (isUnknownGuildMemberError(error)) {
				return null;
			}
			throw error;
		});
	}

	public async listAll({ guild }: ListAllParams = {}): Promise<Map<string, GuildMember>> {
		const resolvedGuild = guild ?? (await this.container.utilities.guild.getOrThrow());
		const membersById = new Map<string, GuildMember>();

		for (const member of resolvedGuild.members.cache.values()) {
			membersById.set(member.id, member);
		}

		let after: string | undefined;
		while (true) {
			const batch = await resolvedGuild.members.list({
				limit: 1000,
				...(after ? { after } : {})
			});

			if (batch.size === 0) {
				break;
			}

			for (const member of batch.values()) {
				membersById.set(member.id, member);
			}

			if (batch.size < 1000) {
				break;
			}

			after = batch.lastKey();
			if (!after) {
				break;
			}
		}

		return membersById;
	}

	public async getOrThrow({ guild, discordUserId }: GetOrThrowParams): Promise<GuildMember> {
		const resolvedGuild = guild ?? (await this.container.utilities.guild.getOrThrow());
		const member = await this.get({
			guild: resolvedGuild,
			discordUserId
		});

		if (!member) {
			throw new Error(`Guild member not found: guildId=${resolvedGuild.id} discordUserId=${discordUserId}`);
		}

		return member;
	}

	public async computeNickname({
		member,
		context,
		totalMeritsOverride,
		contextBindings,
		baseDiscordNicknameOverride
	}: ComputeNicknameParams): Promise<ComputeNicknameResult> {
		const nicknameResult = await buildUserNickname({
			discordUser: member,
			context: createChildExecutionContext({
				context,
				bindings: contextBindings ?? { step: 'buildUserNickname' }
			}),
			totalMeritsOverride,
			baseDiscordNicknameOverride
		});

		return {
			computedNickname: nicknameResult.newUserNickname,
			reason: nicknameResult.reason
		};
	}

	public async syncComputedNickname({
		member,
		context,
		setReason = 'Nickname sync',
		totalMeritsOverride,
		contextBindings
	}: SyncComputedNicknameParams): Promise<SyncComputedNicknameResult> {
		const nicknameResult = await this.computeNickname({
			member,
			context,
			totalMeritsOverride,
			contextBindings
		});

		if (nicknameResult.computedNickname === null) {
			return {
				outcome: 'skipped',
				member,
				computedNickname: null,
				reason: nicknameResult.reason
			};
		}

		if (member.nickname === nicknameResult.computedNickname) {
			return {
				outcome: 'unchanged',
				member,
				computedNickname: nicknameResult.computedNickname
			};
		}

		const updatedMember = await member.setNickname(nicknameResult.computedNickname, setReason);
		return {
			outcome: 'updated',
			member: updatedMember,
			computedNickname: nicknameResult.computedNickname
		};
	}
}

function isUnknownGuildMemberError(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false;
	}

	const code = (error as { code?: unknown }).code;
	if (code === 10007) {
		return true;
	}

	const status = (error as { status?: unknown }).status;
	return status === 404;
}

declare module '@sapphire/plugin-utilities-store' {
	interface Utilities {
		member: MemberUtility;
	}
}
