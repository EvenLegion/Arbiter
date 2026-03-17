import { ApplyOptions } from '@sapphire/decorators';
import { type InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';

import { RoutedButtonInteractionHandler, type RoutedButtonRouteParams } from '../lib/discord/routedInteractionHandler';
import { handleMeritListPageButton } from '../lib/features/merit/read/handleMeritList';
import { parseMeritListButton } from '../lib/features/merit/parseMeritListButton';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class MeritListButtonsInteractionHandler extends RoutedButtonInteractionHandler<NonNullable<ReturnType<typeof parseMeritListButton>>> {
	protected override readonly flow = 'interaction.meritListButtons';

	protected override decode(interaction: ButtonInteraction) {
		return parseMeritListButton({
			customId: interaction.customId
		});
	}

	protected override buildContextBindings(
		_interaction: ButtonInteraction,
		parsedMeritListButton: NonNullable<ReturnType<typeof parseMeritListButton>>
	) {
		return {
			meritListAction: parsedMeritListButton.action,
			targetDiscordUserId: parsedMeritListButton.targetDiscordUserId,
			page: parsedMeritListButton.page
		};
	}

	protected override async route({ interaction, parsed, context }: RoutedButtonRouteParams<NonNullable<ReturnType<typeof parseMeritListButton>>>) {
		await handleMeritListPageButton({
			interaction,
			parsedMeritListButton: parsed,
			context
		});
	}
}
