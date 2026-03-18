import { Events, Listener, type ChatInputCommandErrorPayload } from '@sapphire/framework';
import { createInteractionResponder } from '../../../lib/discord/interactions/interactionResponder';
import { createCommandExecutionContext } from '../../../lib/logging/commandExecutionContext';

export class UserEvent extends Listener<typeof Events.ChatInputCommandError> {
	public override async run(error: unknown, { interaction, command }: ChatInputCommandErrorPayload) {
		const context = createCommandExecutionContext({
			interaction,
			flow: 'listener.chatInputCommandError',
			logReceived: false,
			bindings: {
				caller: 'chatInputCommandError',
				commandName: command?.name ?? interaction.commandName
			}
		});
		const logger = context.logger;
		const responder = createInteractionResponder({
			interaction,
			context,
			logger,
			caller: 'chatInputCommandError'
		});

		logger.error(
			{
				err: error
			},
			'discord.chat_input.failed'
		);

		await responder.fail('An unexpected error occurred.', {
			requestId: true
		});
	}
}
