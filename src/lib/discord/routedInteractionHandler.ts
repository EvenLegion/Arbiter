import { InteractionHandler } from '@sapphire/framework';
import type { ButtonInteraction, ModalSubmitInteraction } from 'discord.js';

import { createExecutionContext, type ExecutionContext } from '../logging/executionContext';

type RoutedInteractionContextParams<TInteraction, TParsed> = {
	interaction: TInteraction;
	parsed: TParsed;
	context: ExecutionContext;
};

export type RoutedButtonRouteParams<TParsed> = RoutedInteractionContextParams<ButtonInteraction, TParsed>;

export type RoutedModalRouteParams<TParsed> = RoutedInteractionContextParams<ModalSubmitInteraction, TParsed>;

export abstract class RoutedButtonInteractionHandler<TParsed> extends InteractionHandler {
	protected abstract readonly flow: string;

	protected abstract decode(interaction: ButtonInteraction): TParsed | null;

	protected abstract buildContextBindings(interaction: ButtonInteraction, parsed: TParsed): Record<string, unknown>;

	protected abstract route(params: RoutedButtonRouteParams<TParsed>): Promise<void>;

	public override parse(interaction: ButtonInteraction) {
		const parsed = this.decode(interaction);
		return parsed ? this.some(parsed) : this.none();
	}

	public override async run(interaction: ButtonInteraction, parsed: TParsed) {
		const context = createExecutionContext({
			bindings: {
				flow: this.flow,
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id,
				customButtonId: interaction.customId,
				...this.buildContextBindings(interaction, parsed)
			}
		});

		await this.route({
			interaction,
			parsed,
			context
		});
	}
}

export abstract class RoutedModalInteractionHandler<TParsed> extends InteractionHandler {
	protected abstract readonly flow: string;

	protected abstract decode(interaction: ModalSubmitInteraction): TParsed | null;

	protected abstract buildContextBindings(interaction: ModalSubmitInteraction, parsed: TParsed): Record<string, unknown>;

	protected abstract route(params: RoutedModalRouteParams<TParsed>): Promise<void>;

	public override parse(interaction: ModalSubmitInteraction) {
		const parsed = this.decode(interaction);
		return parsed ? this.some(parsed) : this.none();
	}

	public override async run(interaction: ModalSubmitInteraction, parsed: TParsed) {
		const context = createExecutionContext({
			bindings: {
				flow: this.flow,
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id,
				customModalId: interaction.customId,
				...this.buildContextBindings(interaction, parsed)
			}
		});

		await this.route({
			interaction,
			parsed,
			context
		});
	}
}
