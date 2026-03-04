import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { handleEventReviewButton } from '../lib/features/event-merit/review/handleEventReviewButton';
import { parseEventReviewButton } from '../lib/features/event-merit/review/parseEventReviewButton';
import { createExecutionContext } from '../lib/logging/executionContext';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class EventReviewButtonsInteractionHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		const parsed = parseEventReviewButton({
			customId: interaction.customId
		});

		return parsed ? this.some(parsed) : this.none();
	}

	public override async run(interaction: ButtonInteraction, parsedEventReviewButton: NonNullable<ReturnType<typeof parseEventReviewButton>>) {
		const context = createExecutionContext({
			bindings: {
				flow: 'interaction.eventReviewButtons',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id,
				customButtonId: interaction.customId,
				eventSessionId: parsedEventReviewButton.eventSessionId,
				eventReviewAction: parsedEventReviewButton.action
			}
		});

		await handleEventReviewButton({
			interaction,
			parsedEventReviewButton,
			context
		});
	}
}
