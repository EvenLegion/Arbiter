import { Events, Listener, type ChatInputCommandErrorPayload } from '@sapphire/framework';
import { createExecutionContext } from '../../../lib/logging/executionContext';

export class UserEvent extends Listener<typeof Events.ChatInputCommandError> {
	public override async run(error: unknown, { interaction, command }: ChatInputCommandErrorPayload) {
		const context = createExecutionContext({
			bindings: {
				flow: 'chatInputCommandError',
				caller: 'chatInputCommandError',
				commandName: command?.name,
				discordInteractionId: interaction.id,
				discordUserId: interaction.user.id
			}
		});
		const logger = context.logger;

		logger.error(
			{
				err: error
			},
			'Unhandled chat input command error'
		);

		const content = `An unexpected error occurred. requestId=\`${context.requestId}\``;
		if (interaction.deferred || interaction.replied) {
			await interaction.editReply({ content }).catch((editError: unknown) => {
				logger.error(
					{
						err: editError
					},
					'Failed to edit interaction reply for chat input command error'
				);
				return undefined;
			});
			return;
		}

		await interaction.reply({ content, ephemeral: true }).catch((replyError: unknown) => {
			logger.error(
				{
					err: replyError
				},
				'Failed to reply to interaction for chat input command error'
			);
			return undefined;
		});
	}
}
