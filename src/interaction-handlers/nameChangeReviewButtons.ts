import { ApplyOptions } from '@sapphire/decorators';
import { type InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';

import { RoutedButtonInteractionHandler, type RoutedButtonRouteParams } from '../lib/discord/routedInteractionHandler';
import { handleNameChangeReviewButton } from '../lib/features/ticket/handleNameChangeReviewButton';
import { parseNameChangeReviewButton } from '../lib/features/ticket/nameChangeReviewButtons';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class NameChangeReviewButtonsInteractionHandler extends RoutedButtonInteractionHandler<
	NonNullable<ReturnType<typeof parseNameChangeReviewButton>>
> {
	protected override readonly flow = 'interaction.nameChangeReviewButtons';

	protected override decode(interaction: ButtonInteraction) {
		return parseNameChangeReviewButton({
			customId: interaction.customId
		});
	}

	protected override buildContextBindings(
		_interaction: ButtonInteraction,
		parsedNameChangeReviewButton: NonNullable<ReturnType<typeof parseNameChangeReviewButton>>
	) {
		return {
			nameChangeRequestId: parsedNameChangeReviewButton.requestId,
			nameChangeAction: parsedNameChangeReviewButton.action
		};
	}

	protected override async route({
		interaction,
		parsed,
		context
	}: RoutedButtonRouteParams<NonNullable<ReturnType<typeof parseNameChangeReviewButton>>>) {
		await handleNameChangeReviewButton({
			interaction,
			parsedNameChangeReviewButton: parsed,
			context
		});
	}
}
