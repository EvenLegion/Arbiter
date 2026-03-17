import type { ChatInputCommandDeniedPayload, Events } from '@sapphire/framework';
import { Listener, UserError } from '@sapphire/framework';
import { createInteractionResponder } from '../../../lib/discord/interactionResponder';
import { createExecutionContext } from '../../../lib/logging/executionContext';

export class UserEvent extends Listener<typeof Events.ChatInputCommandDenied> {
	public override async run({ context, message: content }: UserError, { interaction }: ChatInputCommandDeniedPayload) {
		// `context: { silent: true }` should make UserError silent:
		// Use cases for this are for example permissions error when running the `eval` command.
		if (Reflect.get(Object(context), 'silent')) return;

		const executionContext = createExecutionContext({
			bindings: {
				flow: 'chatInputCommandDenied',
				caller: 'chatInputCommandDenied',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id
			}
		});
		const responder = createInteractionResponder({
			interaction,
			context: executionContext,
			logger: executionContext.logger,
			caller: 'chatInputCommandDenied'
		});

		return responder.fail(content);
	}
}
