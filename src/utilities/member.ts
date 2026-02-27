import { Utility } from '@sapphire/plugin-utilities-store';
import type { Guild, GuildMember } from 'discord.js';

type GetOrThrowParams = {
	guild?: Guild;
	discordUserId: string;
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
		const member =
			resolvedGuild.members.cache.get(discordUserId) ??
			(await resolvedGuild.members.fetch(discordUserId).catch(() => null));

		if (!member) {
			throw new Error(`Guild member not found: guildId=${resolvedGuild.id} discordUserId=${discordUserId}`);
		}

		return member;
	}
}

declare module '@sapphire/plugin-utilities-store' {
	interface Utilities {
		member: MemberUtility;
	}
}
