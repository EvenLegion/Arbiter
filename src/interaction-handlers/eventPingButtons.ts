import { ApplyOptions } from '@sapphire/decorators';
import { type InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';

import { RoutedButtonInteractionHandler, type RoutedButtonRouteParams } from '../lib/discord/interactions/routedInteractionHandler';
import { parseEventPingButtonCustomId, type ParsedEventPingButton } from '../lib/features/event-merit/session/event-ping/eventPingButtonCustomId';
import { handleEventPingButton } from '../lib/features/event-merit/session/event-ping/handleEventPingButton';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class EventPingButtonsInteractionHandler extends RoutedButtonInteractionHandler<ParsedEventPingButton> {
	protected override readonly flow = 'interaction.eventPingButtons';

	protected override decode(interaction: ButtonInteraction) {
		return parseEventPingButtonCustomId(interaction.customId);
	}

	protected override buildContextBindings(_interaction: ButtonInteraction, parsed: ParsedEventPingButton) {
		return {
			eventSessionId: parsed.eventSessionId,
			eventPingAction: parsed.action
		};
	}

	protected override async route({ interaction, parsed, context }: RoutedButtonRouteParams<ParsedEventPingButton>) {
		await handleEventPingButton({
			interaction,
			parsedEventPingButton: parsed,
			context
		});
	}
}
