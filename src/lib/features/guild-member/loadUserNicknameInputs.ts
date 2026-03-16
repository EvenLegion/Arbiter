import { container } from '@sapphire/framework';

import { divisionRepository, meritRepository } from '../../../integrations/prisma/repositories';

export async function loadUserNicknameInputs({
	discordUserId,
	totalMeritsOverride,
	baseDiscordNicknameOverride
}: {
	discordUserId: string;
	totalMeritsOverride?: number;
	baseDiscordNicknameOverride?: string;
}) {
	const [divisions, dbUser] = await Promise.all([
		divisionRepository.listUserDivisions({
			discordUserId
		}),
		container.utilities.userDirectory.getOrThrow({
			discordUserId
		})
	]);

	return {
		divisions,
		baseNickname: baseDiscordNicknameOverride ?? dbUser.discordNickname,
		totalMerits:
			typeof totalMeritsOverride === 'number'
				? totalMeritsOverride
				: await meritRepository.getUserTotalMerits({
						userDbUserId: dbUser.id
					})
	};
}
