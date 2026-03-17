import { Listener, type ChatInputCommandSuccessPayload } from '@sapphire/framework';
import { createCommandExecutionContext } from '../../../lib/logging/commandExecutionContext';

export class UserListener extends Listener {
	public override run(payload: ChatInputCommandSuccessPayload) {
		const context = createCommandExecutionContext({
			interaction: payload.interaction,
			flow: 'listener.chatInputCommandSuccess',
			logReceived: false,
			bindings: {
				commandName: payload.command.name
			}
		});

		context.logger.debug('discord.chat_input.completed');
	}
}
