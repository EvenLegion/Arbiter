import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { handleDivisionSelectionButton } from '../lib/features/division-selection/handleDivisionSelectionButton';
import { createExecutionContext } from '../lib/logging/executionContext';
import { parseDivisionSelection } from '../lib/features/division-selection/parseDivisionSelection';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class DivisionSelectionButtonInteractionHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		const parsed = parseDivisionSelection({ customId: interaction.customId });
		return parsed ? this.some(parsed) : this.none();
	}

	public override async run(
		interaction: ButtonInteraction,
		parsedDivisionSelection: NonNullable<ReturnType<typeof parseDivisionSelection>>
	) {
		const context = createExecutionContext({
			bindings: {
				flow: 'interaction.divisionSelectionButton',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id,
				customButtonId: interaction.customId
			}
		});

		await handleDivisionSelectionButton({ interaction, parsedDivisionSelection, context });
	}
}
