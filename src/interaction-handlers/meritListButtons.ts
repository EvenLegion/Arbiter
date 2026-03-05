import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { handleMeritListPageButton } from '../lib/features/merit/handleMeritList';
import { parseMeritListButton } from '../lib/features/merit/parseMeritListButton';
import { createExecutionContext } from '../lib/logging/executionContext';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class MeritListButtonsInteractionHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		const parsed = parseMeritListButton({
			customId: interaction.customId
		});

		return parsed ? this.some(parsed) : this.none();
	}

	public override async run(interaction: ButtonInteraction, parsedMeritListButton: NonNullable<ReturnType<typeof parseMeritListButton>>) {
		const context = createExecutionContext({
			bindings: {
				flow: 'interaction.meritListButtons',
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id,
				customButtonId: interaction.customId,
				meritListAction: parsedMeritListButton.action,
				targetDiscordUserId: parsedMeritListButton.targetDiscordUserId,
				page: parsedMeritListButton.page
			}
		});

		await handleMeritListPageButton({
			interaction,
			parsedMeritListButton,
			context
		});
	}
}
