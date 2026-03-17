import { InteractionHandler } from '@sapphire/framework';
import type { ButtonInteraction, ModalSubmitInteraction } from 'discord.js';

import { type ExecutionContext } from '../logging/executionContext';
import { createButtonExecutionContext, createModalExecutionContext } from '../logging/ingressExecutionContext';

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
		const context = createButtonExecutionContext({
			interaction,
			flow: this.flow,
			bindings: this.buildContextBindings(interaction, parsed)
		});

		try {
			await this.route({
				interaction,
				parsed,
				context
			});
			context.logger.debug('discord.button.completed');
		} catch (error) {
			context.logger.error(
				{
					err: error
				},
				'discord.button.failed'
			);
			throw error;
		}
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
		const context = createModalExecutionContext({
			interaction,
			flow: this.flow,
			bindings: this.buildContextBindings(interaction, parsed)
		});

		try {
			await this.route({
				interaction,
				parsed,
				context
			});
			context.logger.debug('discord.modal.completed');
		} catch (error) {
			context.logger.error(
				{
					err: error
				},
				'discord.modal.failed'
			);
			throw error;
		}
	}
}
