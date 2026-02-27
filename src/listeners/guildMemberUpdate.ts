import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import type { GuildMember, PartialGuildMember } from 'discord.js';
import { handleGuildMemberUpdate } from '../lib/features/guild-member/onGuildMemberUpdate';
import { createExecutionContext } from '../lib/logging/executionContext';

@ApplyOptions<Listener.Options>({
	event: 'guildMemberUpdate'
})
export class GuildMemberUpdateListener extends Listener {
	public override async run(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
		const context = createExecutionContext({
			bindings: {
				flow: 'listener.guildMemberUpdate',
				discordUserId: newMember.id,
				guildId: newMember.guild.id
			}
		});

		await handleGuildMemberUpdate({ oldMember, newMember, context });
	}
}
