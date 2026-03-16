import { ApplyOptions } from '@sapphire/decorators';
import { type InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';

import { RoutedButtonInteractionHandler, type RoutedButtonRouteParams } from '../lib/discord/routedInteractionHandler';
import { handleEventReviewButton } from '../lib/features/event-merit/review/handleEventReviewButton';
import { parseEventReviewButton } from '../lib/features/event-merit/review/parseEventReviewButton';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class EventReviewButtonsInteractionHandler extends RoutedButtonInteractionHandler<NonNullable<ReturnType<typeof parseEventReviewButton>>> {
	protected override readonly flow = 'interaction.eventReviewButtons';

	protected override decode(interaction: ButtonInteraction) {
		return parseEventReviewButton({
			customId: interaction.customId
		});
	}

	protected override buildContextBindings(
		_interaction: ButtonInteraction,
		parsedEventReviewButton: NonNullable<ReturnType<typeof parseEventReviewButton>>
	) {
		return {
			eventSessionId: parsedEventReviewButton.eventSessionId,
			eventReviewAction: parsedEventReviewButton.action
		};
	}

	protected override async route({
		interaction,
		parsed,
		context
	}: RoutedButtonRouteParams<NonNullable<ReturnType<typeof parseEventReviewButton>>>) {
		await handleEventReviewButton({
			interaction,
			parsedEventReviewButton: parsed,
			context
		});
	}
}
