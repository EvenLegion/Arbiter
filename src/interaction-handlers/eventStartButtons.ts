import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { handleEventStartButton } from '../lib/features/event-merit/session/handleEventStartButton';
import { parseEventStartButton } from '../lib/features/event-merit/session/parseEventStartButton';
import { createExecutionContext } from '../lib/logging/executionContext';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class EventStartButtonsInteractionHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		const parsed = parseEventStartButton({
			customId: interaction.customId
		});

		return parsed ? this.some(parsed) : this.none();
	}

	public override async run(interaction: ButtonInteraction, parsedEventStartButton: NonNullable<ReturnType<typeof parseEventStartButton>>) {
		const context = createExecutionContext({
			bindings: {
				flow: 'interaction.eventStartButtons',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id,
				customButtonId: interaction.customId,
				eventSessionId: parsedEventStartButton.eventSessionId,
				eventStartAction: parsedEventStartButton.action
			}
		});

		await handleEventStartButton({
			interaction,
			parsedEventStartButton,
			context
		});
	}
}
