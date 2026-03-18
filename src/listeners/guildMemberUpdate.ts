import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import type { GuildMember, PartialGuildMember } from 'discord.js';
import { handleGuildMemberUpdate } from '../lib/features/guild-member/handlers/handleGuildMemberUpdate';
import { createListenerExecutionContext } from '../lib/logging/ingressExecutionContext';

@ApplyOptions<Listener.Options>({
	event: 'guildMemberUpdate'
})
export class GuildMemberUpdateListener extends Listener {
	public override async run(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
		const context = createListenerExecutionContext({
			eventName: 'guildMemberUpdate',
			flow: 'listener.guildMemberUpdate',
			bindings: {
				discordUserId: newMember.id,
				guildId: newMember.guild.id
			}
		});

		try {
			await handleGuildMemberUpdate({ oldMember, newMember, context });
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
