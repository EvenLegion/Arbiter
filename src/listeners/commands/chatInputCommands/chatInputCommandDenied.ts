import type { ChatInputCommandDeniedPayload, Events } from '@sapphire/framework';
import { Listener, UserError } from '@sapphire/framework';
import { createInteractionResponder } from '../../../lib/discord/interactions/interactionResponder';
import { createCommandExecutionContext } from '../../../lib/logging/commandExecutionContext';

export class UserEvent extends Listener<typeof Events.ChatInputCommandDenied> {
	public override async run({ context, message: content }: UserError, { interaction }: ChatInputCommandDeniedPayload) {
		// `context: { silent: true }` should make UserError silent:
		// Use cases for this are for example permissions error when running the `eval` command.
		if (Reflect.get(Object(context), 'silent')) return;

		const executionContext = createCommandExecutionContext({
			interaction,
			flow: 'listener.chatInputCommandDenied',
			logReceived: false,
			bindings: {
				caller: 'chatInputCommandDenied'
			}
		});
		executionContext.logger.info(
			{
				denialMessage: content
			},
			'discord.chat_input.denied'
		);
		const responder = createInteractionResponder({
			interaction,
			context: executionContext,
			logger: executionContext.logger,
			caller: 'chatInputCommandDenied'
		});

		return responder.fail(content);
	}
}
