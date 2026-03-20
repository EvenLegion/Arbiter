import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import type { GuildMember } from 'discord.js';
import { handleGuildMemberAdd } from '../lib/features/guild-member/handlers/handleGuildMemberAdd';
import { createListenerExecutionContext } from '../lib/logging/ingressExecutionContext';

@ApplyOptions<Listener.Options>({
	event: 'guildMemberAdd'
})
export class GuildMemberAddListener extends Listener {
	public override async run(member: GuildMember) {
		const context = createListenerExecutionContext({
			eventName: 'guildMemberAdd',
			flow: 'listener.guildMemberAdd',
			bindings: {
				discordUserId: member.id,
				guildId: member.guild.id
			}
		});

		try {
			await handleGuildMemberAdd({ member, context });
			context.logger.debug('discord.listener.completed');
		} catch (error) {
			context.logger.error(
				{
					err: error
				},
				'discord.listener.failed'
			);
			throw error;
		}
	}
}
