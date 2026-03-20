import { ApplyOptions } from '@sapphire/decorators';
import { type InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';

import { RoutedButtonInteractionHandler, type RoutedButtonRouteParams } from '../lib/discord/interactions/routedInteractionHandler';
import { handleMeritListPageButton } from '../lib/features/merit/read/handleMeritList';
import { parseMeritListButtonCustomId } from '../lib/features/merit/read/meritListButtonCustomId';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class MeritListButtonsInteractionHandler extends RoutedButtonInteractionHandler<NonNullable<ReturnType<typeof parseMeritListButtonCustomId>>> {
	protected override readonly flow = 'interaction.meritListButtons';

	protected override decode(interaction: ButtonInteraction) {
		return parseMeritListButtonCustomId({
			customId: interaction.customId
		});
	}

	protected override buildContextBindings(
		_interaction: ButtonInteraction,
		parsedMeritListButton: NonNullable<ReturnType<typeof parseMeritListButtonCustomId>>
	) {
		return {
			meritListAction: parsedMeritListButton.action,
			targetDiscordUserId: parsedMeritListButton.targetDiscordUserId,
			page: parsedMeritListButton.page
		};
	}

	protected override async route({
		interaction,
		parsed,
		context
	}: RoutedButtonRouteParams<NonNullable<ReturnType<typeof parseMeritListButtonCustomId>>>) {
		await handleMeritListPageButton({
			interaction,
			parsedMeritListButton: parsed,
			context
		});
	}
}
