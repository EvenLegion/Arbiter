import { Events, Listener, type ChatInputCommandErrorPayload } from '@sapphire/framework';
import { createInteractionResponder } from '../../../lib/discord/interactionResponder';
import { createExecutionContext } from '../../../lib/logging/executionContext';

export class UserEvent extends Listener<typeof Events.ChatInputCommandError> {
	public override async run(error: unknown, { interaction, command }: ChatInputCommandErrorPayload) {
		const context = createExecutionContext({
			bindings: {
				flow: 'chatInputCommandError',
				caller: 'chatInputCommandError',
				commandName: command?.name,
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id
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
			'Unhandled chat input command error'
		);

		await responder.fail('An unexpected error occurred.', {
			requestId: true
		});
	}
}
