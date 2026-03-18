import { ApplyOptions } from '@sapphire/decorators';
import { type InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';

import { RoutedButtonInteractionHandler, type RoutedButtonRouteParams } from '../lib/discord/interactions/routedInteractionHandler';
import { parseEventReviewButtonCustomId, type ParsedEventReviewButton } from '../lib/features/event-merit/review/buttons/eventReviewButtonProtocol';
import { handleEventReviewButton } from '../lib/features/event-merit/review/buttons/handleEventReviewButton';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class EventReviewButtonsInteractionHandler extends RoutedButtonInteractionHandler<ParsedEventReviewButton> {
	protected override readonly flow = 'interaction.eventReviewButtons';

	protected override decode(interaction: ButtonInteraction) {
		return parseEventReviewButtonCustomId(interaction.customId);
	}

	protected override buildContextBindings(_interaction: ButtonInteraction, parsedEventReviewButton: ParsedEventReviewButton) {
		return {
			eventSessionId: parsedEventReviewButton.eventSessionId,
			eventReviewAction: parsedEventReviewButton.action
		};
	}

	protected override async route({ interaction, parsed, context }: RoutedButtonRouteParams<ParsedEventReviewButton>) {
		await handleEventReviewButton({
			interaction,
			parsedEventReviewButton: parsed,
			context
		});
	}
}
