import { ApplyOptions } from '@sapphire/decorators';
import { type InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';

import { RoutedButtonInteractionHandler, type RoutedButtonRouteParams } from '../lib/discord/routedInteractionHandler';
import { handleEventStartButton } from '../lib/features/event-merit/session/handleEventStartButton';
import { parseEventStartButton } from '../lib/features/event-merit/session/parseEventStartButton';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class EventStartButtonsInteractionHandler extends RoutedButtonInteractionHandler<NonNullable<ReturnType<typeof parseEventStartButton>>> {
	protected override readonly flow = 'interaction.eventStartButtons';

	protected override decode(interaction: ButtonInteraction) {
		return parseEventStartButton({
			customId: interaction.customId
		});
	}

	protected override buildContextBindings(
		_interaction: ButtonInteraction,
		parsedEventStartButton: NonNullable<ReturnType<typeof parseEventStartButton>>
	) {
		return {
			eventSessionId: parsedEventStartButton.eventSessionId,
			eventStartAction: parsedEventStartButton.action
		};
	}

	protected override async route({ interaction, parsed, context }: RoutedButtonRouteParams<NonNullable<ReturnType<typeof parseEventStartButton>>>) {
		await handleEventStartButton({
			interaction,
			parsedEventStartButton: parsed,
			context
		});
	}
}
