import type { GuildMember } from 'discord.js';

import { container } from '@sapphire/framework';
import { createManyDivisionMembership, deleteManyDivisionMembership } from '../../../../integrations/prisma';
import { ENV_DISCORD } from '../../../../config/env';
import { deleteAuxVcCredit } from '../../../../integrations/redis/auxVcCredit';
import type { ExecutionContext } from '../../../logging/executionContext';

type PromoteAuxMemberToLgnParams = {
	discordUser: GuildMember;
	context: ExecutionContext;
};

export async function promoteAuxMemberToLgn({ discordUser, context }: PromoteAuxMemberToLgnParams) {
	const caller = 'promoteAuxMemberToLgn';
	const logger = context.logger.child({ caller });

	if (!discordUser.roles.cache.has(ENV_DISCORD.AUX_ROLE_ID)) {
		logger.error(
			{
				discordUserId: discordUser.id
			},
			'Discord user no longer has AUX role'
		);
		throw new Error('Discord user no longer has AUX role');
	}

	const finalRoleIds = new Set<string>(discordUser.roles.cache.keys());
	finalRoleIds.delete(ENV_DISCORD.AUX_ROLE_ID);
	finalRoleIds.add(ENV_DISCORD.LGN_ROLE_ID);

	await discordUser.roles.set([...finalRoleIds], 'Promoted AUX to LGN from voice activity credits');

	await deleteAuxVcCredit({ discordUserId: discordUser.id });

	await deleteManyDivisionMembership({
		discordUserId: discordUser.id,
		divisionIds: [(await container.utilities.divisionCache.getByCode('AUX'))!.id]
	});

	await createManyDivisionMembership({
		discordUserId: discordUser.id,
		divisionIds: [(await container.utilities.divisionCache.getByCode('LGN'))!.id]
	});
}
