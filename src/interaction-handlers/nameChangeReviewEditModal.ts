import { ApplyOptions } from '@sapphire/decorators';
import { type InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ModalSubmitInteraction } from 'discord.js';

import { handleNameChangeReviewEditModal } from '../lib/features/ticket/handleNameChangeReviewEditModal';
import { RoutedModalInteractionHandler, type RoutedModalRouteParams } from '../lib/discord/routedInteractionHandler';
import { parseNameChangeReviewModal } from '../lib/features/ticket/nameChangeReviewButtons';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class NameChangeReviewEditModalInteractionHandler extends RoutedModalInteractionHandler<
	NonNullable<ReturnType<typeof parseNameChangeReviewModal>>
> {
	protected override readonly flow = 'interaction.nameChangeReviewEditModal';

	protected override decode(interaction: ModalSubmitInteraction) {
		return parseNameChangeReviewModal({
			customId: interaction.customId
		});
	}

	protected override buildContextBindings(
		_interaction: ModalSubmitInteraction,
		parsedNameChangeReviewModal: NonNullable<ReturnType<typeof parseNameChangeReviewModal>>
	) {
		return {
			nameChangeRequestId: parsedNameChangeReviewModal.requestId
		};
	}

	protected override async route({
		interaction,
		parsed,
		context
	}: RoutedModalRouteParams<NonNullable<ReturnType<typeof parseNameChangeReviewModal>>>) {
		await handleNameChangeReviewEditModal({
			interaction,
			parsedNameChangeReviewModal: parsed,
			context
		});
	}
}
