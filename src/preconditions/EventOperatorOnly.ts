import { AllFlowsPrecondition, type ChatInputCommand, type ContextMenuCommand, type MessageCommand, type Precondition } from '@sapphire/framework';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';
import { DivisionKind } from '@prisma/client';
import { ENV_DISCORD } from '../config/env';

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

		const guild = await this.container.utilities.guild.getOrThrow().catch(() => null);
		if (!guild) {
			return this.error({
				message: 'This command can only be used in a server.'
			});
		}

		let member: GuildMember;
		try {
			member = await this.container.utilities.member.getOrThrow({
				guild,
				discordUserId: interaction.user.id
			});
		} catch {
			return this.error({
				message: 'Could not resolve your member record in this server.'
			});
		}

		const isStaff = await this.container.utilities.divisionRolePolicy.memberHasDivisionKindRole({
			member,
			requiredRoleKinds: [DivisionKind.STAFF]
		});
		const isCenturion = await this.container.utilities.divisionRolePolicy.memberHasDivision({
			member,
			divisionDiscordRoleId: ENV_DISCORD.CENT_ROLE_ID
		});

		if (isStaff || isCenturion) {
			return this.ok();
		}

		return this.error({
			message: 'Only staff members or Centurions can perform this action.'
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
