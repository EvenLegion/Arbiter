import { getDbUserOrThrow } from '../../discord/userDirectoryGateway';
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
		getDbUserOrThrow({ discordUserId })
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
