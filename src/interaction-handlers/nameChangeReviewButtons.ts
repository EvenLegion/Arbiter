import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';

import { createExecutionContext } from '../lib/logging/executionContext';
import { handleNameChangeReviewButton } from '../lib/features/ticket/handleNameChangeReviewButton';
import { parseNameChangeReviewButton } from '../lib/features/ticket/nameChangeReviewButtons';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class NameChangeReviewButtonsInteractionHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		const parsed = parseNameChangeReviewButton({
			customId: interaction.customId
		});

		return parsed ? this.some(parsed) : this.none();
	}

	public override async run(
		interaction: ButtonInteraction,
		parsedNameChangeReviewButton: NonNullable<ReturnType<typeof parseNameChangeReviewButton>>
	) {
		const context = createExecutionContext({
			bindings: {
				flow: 'interaction.nameChangeReviewButtons',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id,
				customButtonId: interaction.customId,
				nameChangeRequestId: parsedNameChangeReviewButton.requestId,
				nameChangeDecision: parsedNameChangeReviewButton.decision
			}
		});

		await handleNameChangeReviewButton({
			interaction,
			parsedNameChangeReviewButton,
			context
		});
	}
}
