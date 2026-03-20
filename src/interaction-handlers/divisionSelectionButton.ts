import { ApplyOptions } from '@sapphire/decorators';
import { type InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';

import { RoutedButtonInteractionHandler, type RoutedButtonRouteParams } from '../lib/discord/interactions/routedInteractionHandler';
import { parseDivisionSelectionCustomId, type ParsedDivisionSelection } from '../lib/features/division-selection/divisionSelectionCustomId';
import { handleDivisionSelectionButton } from '../lib/features/division-selection/handlers/handleDivisionSelectionButton';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class DivisionSelectionButtonInteractionHandler extends RoutedButtonInteractionHandler<ParsedDivisionSelection> {
	protected override readonly flow = 'interaction.divisionSelectionButton';

	protected override decode(interaction: ButtonInteraction) {
		return parseDivisionSelectionCustomId(interaction.customId);
	}

	protected override buildContextBindings(_interaction: ButtonInteraction, parsedDivisionSelection: ParsedDivisionSelection) {
		return {
			divisionSelectionAction: parsedDivisionSelection.action,
			divisionCode: parsedDivisionSelection.code
		};
	}

	protected override async route({ interaction, parsed, context }: RoutedButtonRouteParams<ParsedDivisionSelection>) {
		await handleDivisionSelectionButton({ interaction, parsedDivisionSelection: parsed, context });
	}
}
