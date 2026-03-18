import { AllFlowsPrecondition, type ChatInputCommand, type ContextMenuCommand, type MessageCommand, type Precondition } from '@sapphire/framework';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, Message } from 'discord.js';
import { resolvePreconditionActor } from '../lib/discord/actor/preconditionActor';

export class EventOperatorOnlyPrecondition extends AllFlowsPrecondition {
	public override messageRun(_message: Message, _command: MessageCommand, _context: Precondition.Context) {
		void _message;
		void _command;
		void _context;
		return this.error({
			message: 'This command is only available as a slash command.'
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction, _command: ChatInputCommand, _context: Precondition.Context) {
		void _command;
		void _context;

		const actor = await resolvePreconditionActor({
			interaction,
			preconditionName: 'EventOperatorOnly',
			capabilityRequirement: 'staff-or-centurion'
		});
		return actor.ok
			? this.ok()
			: this.error({
					message: actor.message
				});
	}

	public override contextMenuRun(_interaction: ContextMenuCommandInteraction, _command: ContextMenuCommand, _context: Precondition.Context) {
		void _interaction;
		void _command;
		void _context;
		return this.error({
			message: 'This command is only available as a slash command.'
		});
	}
}

declare module '@sapphire/framework' {
	interface Preconditions {
		EventOperatorOnly: never;
	}
}
