import { ApplyOptions } from '@sapphire/decorators';
import { type InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';

import { RoutedButtonInteractionHandler, type RoutedButtonRouteParams } from '../lib/discord/routedInteractionHandler';
import { handleDivisionSelectionButton } from '../lib/features/division-selection/handleDivisionSelectionButton';
import { parseDivisionSelection } from '../lib/features/division-selection/parseDivisionSelection';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class DivisionSelectionButtonInteractionHandler extends RoutedButtonInteractionHandler<
	NonNullable<ReturnType<typeof parseDivisionSelection>>
> {
	protected override readonly flow = 'interaction.divisionSelectionButton';

	protected override decode(interaction: ButtonInteraction) {
		return parseDivisionSelection({ customId: interaction.customId });
	}

	protected override buildContextBindings(
		_interaction: ButtonInteraction,
		parsedDivisionSelection: NonNullable<ReturnType<typeof parseDivisionSelection>>
	) {
		return {
			divisionSelectionAction: parsedDivisionSelection.action,
			divisionCode: parsedDivisionSelection.code
		};
	}

	protected override async route({
		interaction,
		parsed,
		context
	}: RoutedButtonRouteParams<NonNullable<ReturnType<typeof parseDivisionSelection>>>) {
		await handleDivisionSelectionButton({ interaction, parsedDivisionSelection: parsed, context });
	}
}
