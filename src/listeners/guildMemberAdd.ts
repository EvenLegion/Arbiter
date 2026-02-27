import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import type { GuildMember } from 'discord.js';
import { handleGuildMemberAdd } from '../lib/features/guild-member/onGuildMemberAdd';
import { createExecutionContext } from '../lib/logging/executionContext';

@ApplyOptions<Listener.Options>({
	event: 'guildMemberAdd'
})
export class GuildMemberAddListener extends Listener {
	public override async run(member: GuildMember) {
		const context = createExecutionContext({
			bindings: {
				flow: 'listener.guildMemberAdd',
				discordUserId: member.id,
				guildId: member.guild.id
			}
		});

		await handleGuildMemberAdd({ member, context });
	}
}
