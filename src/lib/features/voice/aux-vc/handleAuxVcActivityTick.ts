import { container } from '@sapphire/framework';
import type { GuildMember } from 'discord.js';
import { awardCreditToMember } from './awardCreditToMember';
import { monitorState } from './monitorState';
import { reconcileEligibility } from './reconcileEligibility';
import { createChildExecutionContext, type ExecutionContext } from '../../../logging/executionContext';

type HandleAuxVcActivityTickParams = {
	context: ExecutionContext;
};

export async function handleAuxVcActivityTick({ context }: HandleAuxVcActivityTickParams) {
	const caller = 'handleAuxVcActivityTick';
	const logger = context.logger.child({ caller });

	await reconcileEligibility({
		context: createChildExecutionContext({
			context,
			bindings: {
				step: 'preTickReconcile'
			}
		})
	});

	const eligibleMemberDiscordUserIds = [...monitorState.eligibleMemberDiscordUserIds];
	if (eligibleMemberDiscordUserIds.length === 0) {
		logger.trace({}, 'No eligible AUX members to award this tick');
		return;
	}

	logger.debug(
		{
			eligibleMemberCount: eligibleMemberDiscordUserIds.length
		},
		'Processing AUX VC tick for eligible members'
	);

	for (const discordUserId of eligibleMemberDiscordUserIds) {
		let discordUser: GuildMember;
		try {
			discordUser = await container.utilities.member.getOrThrow({
				discordUserId
			});
		} catch {
			logger.warn(
				{
					discordUserId
				},
				'Eligible AUX member not found in guild'
			);
			continue;
		}

		try {
			await awardCreditToMember({
				discordUser,
				context: createChildExecutionContext({
					context,
					bindings: {
						step: 'awardCreditToMember',
						discordUserId
					}
				})
			});
		} catch (err) {
			logger.error(
				{
					discordUserId,
					discordUserTag: discordUser.user.tag,
					err
				},
				'Failed to award AUX VC credit to member'
			);
		}
	}
}
