import { ApplyOptions } from '@sapphire/decorators';
import { type InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';

import { RoutedButtonInteractionHandler, type RoutedButtonRouteParams } from '../lib/discord/interactions/routedInteractionHandler';
import { handleMeritRankListPageButton } from '../lib/features/merit/rank-list/handleMeritRankList';
import { parseMeritRankListButtonCustomId } from '../lib/features/merit/rank-list/meritRankListButtonCustomId';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class MeritRankListButtonsInteractionHandler extends RoutedButtonInteractionHandler<
	NonNullable<ReturnType<typeof parseMeritRankListButtonCustomId>>
> {
	protected override readonly flow = 'interaction.meritRankListButtons';

	protected override decode(interaction: ButtonInteraction) {
		return parseMeritRankListButtonCustomId({
			customId: interaction.customId
		});
	}

	protected override buildContextBindings(
		_interaction: ButtonInteraction,
		parsedMeritRankListButton: NonNullable<ReturnType<typeof parseMeritRankListButtonCustomId>>
	) {
		return {
			meritRankListAction: parsedMeritRankListButton.action,
			page: parsedMeritRankListButton.page
		};
	}

	protected override async route({
		interaction,
		parsed,
		context
	}: RoutedButtonRouteParams<NonNullable<ReturnType<typeof parseMeritRankListButtonCustomId>>>) {
		await handleMeritRankListPageButton({
			interaction,
			parsedMeritRankListButton: parsed,
			context
		});
	}
}
