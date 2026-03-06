import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ModalSubmitInteraction } from 'discord.js';

import { handleNameChangeReviewEditModal } from '../lib/features/ticket/handleNameChangeReviewEditModal';
import { createExecutionContext } from '../lib/logging/executionContext';
import { parseNameChangeReviewModal } from '../lib/features/ticket/nameChangeReviewButtons';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class NameChangeReviewEditModalInteractionHandler extends InteractionHandler {
	public override parse(interaction: ModalSubmitInteraction) {
		const parsed = parseNameChangeReviewModal({
			customId: interaction.customId
		});

		return parsed ? this.some(parsed) : this.none();
	}

	public override async run(
		interaction: ModalSubmitInteraction,
		parsedNameChangeReviewModal: NonNullable<ReturnType<typeof parseNameChangeReviewModal>>
	) {
		const context = createExecutionContext({
			bindings: {
				flow: 'interaction.nameChangeReviewEditModal',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id,
				customModalId: interaction.customId,
				nameChangeRequestId: parsedNameChangeReviewModal.requestId
			}
		});

		await handleNameChangeReviewEditModal({
			interaction,
			parsedNameChangeReviewModal,
			context
		});
	}
}
