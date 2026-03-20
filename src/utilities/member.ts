import { Utility } from '@sapphire/plugin-utilities-store';
import type { Guild, GuildMember } from 'discord.js';

type GetOrThrowParams = {
	guild?: Guild;
	discordUserId: string;
};

type GetParams = GetOrThrowParams;

type ListAllParams = {
	guild?: Guild;
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
}

function isUnknownGuildMemberError(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false;
	}

	const code = (error as { code?: unknown }).code;
	return code === 10007 || code === '10007';
}

declare module '@sapphire/plugin-utilities-store' {
	interface Utilities {
		member: MemberUtility;
	}
}
