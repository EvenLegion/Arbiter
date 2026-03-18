import { ApplyOptions } from '@sapphire/decorators';
import { type InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';

import { RoutedButtonInteractionHandler, type RoutedButtonRouteParams } from '../lib/discord/interactions/routedInteractionHandler';
import { parseEventStartButtonCustomId, type ParsedEventStartButton } from '../lib/features/event-merit/session/buttons/eventStartButtonCustomId';
import { handleEventStartButton } from '../lib/features/event-merit/session/buttons/handleEventStartButton';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class EventStartButtonsInteractionHandler extends RoutedButtonInteractionHandler<ParsedEventStartButton> {
	protected override readonly flow = 'interaction.eventStartButtons';

	protected override decode(interaction: ButtonInteraction) {
		return parseEventStartButtonCustomId(interaction.customId);
	}

	protected override buildContextBindings(_interaction: ButtonInteraction, parsedEventStartButton: ParsedEventStartButton) {
		return {
			eventSessionId: parsedEventStartButton.eventSessionId,
			eventStartAction: parsedEventStartButton.action
		};
	}

	protected override async route({ interaction, parsed, context }: RoutedButtonRouteParams<ParsedEventStartButton>) {
		await handleEventStartButton({
			interaction,
			parsedEventStartButton: parsed,
			context
		});
	}
}
