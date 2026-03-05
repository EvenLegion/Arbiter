import { Utility } from '@sapphire/plugin-utilities-store';
import type { Guild, GuildMember } from 'discord.js';
import { buildUserNickname } from '../lib/features/guild-member/buildUserNickname';
import { createChildExecutionContext, type ExecutionContext } from '../lib/logging/executionContext';

type GetOrThrowParams = {
	guild?: Guild;
	discordUserId: string;
};

type SyncComputedNicknameParams = {
	member: GuildMember;
	context: ExecutionContext;
	setReason?: string;
	totalMeritsOverride?: number;
	contextBindings?: Record<string, unknown>;
};

type ComputeNicknameParams = Omit<SyncComputedNicknameParams, 'setReason'>;

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

	public async getOrThrow({ guild, discordUserId }: GetOrThrowParams): Promise<GuildMember> {
		const resolvedGuild = guild ?? (await this.container.utilities.guild.getOrThrow());
		const member = resolvedGuild.members.cache.get(discordUserId) ?? (await resolvedGuild.members.fetch(discordUserId).catch(() => null));

		if (!member) {
			throw new Error(`Guild member not found: guildId=${resolvedGuild.id} discordUserId=${discordUserId}`);
		}

		return member;
	}

	public async computeNickname({ member, context, totalMeritsOverride, contextBindings }: ComputeNicknameParams): Promise<ComputeNicknameResult> {
		const nicknameResult = await buildUserNickname({
			discordUser: member,
			context: createChildExecutionContext({
				context,
				bindings: contextBindings ?? { step: 'buildUserNickname' }
			}),
			totalMeritsOverride
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

declare module '@sapphire/plugin-utilities-store' {
	interface Utilities {
		member: MemberUtility;
	}
}
