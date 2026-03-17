import type { AutocompleteInteraction, ButtonInteraction, ChatInputCommandInteraction, ModalSubmitInteraction } from 'discord.js';

import { createExecutionContext } from './executionContext';

type IngressBindings = Record<string, unknown>;

type CommandLikeOptions = {
	getSubcommandGroup?: (required?: boolean) => string | null;
	getSubcommand?: (required?: boolean) => string | null;
};

function getOptionalSubcommandGroup(options: CommandLikeOptions) {
	return typeof options?.getSubcommandGroup === 'function' ? options.getSubcommandGroup(false) : null;
}

function getOptionalSubcommand(options: CommandLikeOptions) {
	return typeof options?.getSubcommand === 'function' ? options.getSubcommand(false) : null;
}

function withOptionalBindings(bindings: Record<string, unknown>) {
	return Object.fromEntries(Object.entries(bindings).filter(([, value]) => value !== null && value !== undefined));
}

export function createCommandExecutionContext({
	interaction,
	flow,
	bindings = {},
	logReceived = true
}: {
	interaction: Pick<ChatInputCommandInteraction, 'id' | 'user' | 'guildId' | 'channelId' | 'commandName' | 'options'>;
	flow: string;
	bindings?: IngressBindings;
	logReceived?: boolean;
}) {
	const subcommandGroupName = getOptionalSubcommandGroup(interaction.options as CommandLikeOptions);
	const subcommandName = getOptionalSubcommand(interaction.options as CommandLikeOptions);
	const context = createExecutionContext({
		requestId: interaction.id,
		bindings: {
			flow,
			transport: 'chat_input',
			discordInteractionId: interaction.id,
			...withOptionalBindings({
				discordUserId: interaction.user?.id
			}),
			...withOptionalBindings({
				guildId: interaction.guildId,
				channelId: interaction.channelId,
				commandName: interaction.commandName,
				subcommandGroupName,
				subcommandName
			}),
			...bindings
		}
	});

	if (logReceived) {
		context.logger.debug('discord.chat_input.received');
	}

	return context;
}

export function createAutocompleteExecutionContext({
	interaction,
	commandName,
	bindings = {},
	logReceived = true
}: {
	interaction: Pick<AutocompleteInteraction, 'id' | 'user' | 'guildId' | 'channelId' | 'options'>;
	commandName: string;
	bindings?: IngressBindings;
	logReceived?: boolean;
}) {
	const subcommandGroupName = getOptionalSubcommandGroup(interaction.options as CommandLikeOptions);
	const subcommandName = getOptionalSubcommand(interaction.options as CommandLikeOptions);
	const focused = interaction.options?.getFocused?.(true);
	const context = createExecutionContext({
		requestId: interaction.id,
		bindings: {
			flow: `autocomplete.${commandName}`,
			transport: 'autocomplete',
			discordInteractionId: interaction.id,
			...withOptionalBindings({
				discordUserId: interaction.user?.id
			}),
			...withOptionalBindings({
				guildId: interaction.guildId,
				channelId: interaction.channelId,
				commandName,
				subcommandGroupName,
				subcommandName,
				focusedOptionName: focused?.name
			}),
			...bindings
		}
	});

	if (logReceived) {
		context.logger.debug('discord.autocomplete.received');
	}

	return context;
}

export function createButtonExecutionContext({
	interaction,
	flow,
	bindings = {},
	logReceived = true
}: {
	interaction: Pick<ButtonInteraction, 'id' | 'user' | 'guildId' | 'channelId' | 'customId'>;
	flow: string;
	bindings?: IngressBindings;
	logReceived?: boolean;
}) {
	const context = createExecutionContext({
		requestId: interaction.id,
		bindings: {
			flow,
			transport: 'button',
			discordInteractionId: interaction.id,
			...withOptionalBindings({
				discordUserId: interaction.user?.id
			}),
			...withOptionalBindings({
				guildId: interaction.guildId,
				channelId: interaction.channelId,
				customButtonId: interaction.customId
			}),
			...bindings
		}
	});

	if (logReceived) {
		context.logger.debug('discord.button.received');
	}

	return context;
}

export function createModalExecutionContext({
	interaction,
	flow,
	bindings = {},
	logReceived = true
}: {
	interaction: Pick<ModalSubmitInteraction, 'id' | 'user' | 'guildId' | 'channelId' | 'customId'>;
	flow: string;
	bindings?: IngressBindings;
	logReceived?: boolean;
}) {
	const context = createExecutionContext({
		requestId: interaction.id,
		bindings: {
			flow,
			transport: 'modal',
			discordInteractionId: interaction.id,
			...withOptionalBindings({
				discordUserId: interaction.user?.id
			}),
			...withOptionalBindings({
				guildId: interaction.guildId,
				channelId: interaction.channelId,
				customModalId: interaction.customId
			}),
			...bindings
		}
	});

	if (logReceived) {
		context.logger.debug('discord.modal.received');
	}

	return context;
}

export function createListenerExecutionContext({
	eventName,
	flow,
	bindings = {},
	requestId,
	logReceived = true
}: {
	eventName: string;
	flow: string;
	bindings?: IngressBindings;
	requestId?: string;
	logReceived?: boolean;
}) {
	const context = createExecutionContext({
		requestId,
		bindings: {
			flow,
			transport: 'listener',
			eventName,
			...bindings
		}
	});

	if (logReceived) {
		context.logger.debug('discord.listener.received');
	}

	return context;
}

export function createScheduledTaskExecutionContext({
	taskName,
	flow,
	bindings = {},
	requestId
}: {
	taskName: string;
	flow: string;
	bindings?: IngressBindings;
	requestId?: string;
}) {
	const context = createExecutionContext({
		requestId,
		bindings: {
			flow,
			transport: 'scheduled_task',
			taskName,
			...bindings
		}
	});

	context.logger.debug('task.started');

	return context;
}
