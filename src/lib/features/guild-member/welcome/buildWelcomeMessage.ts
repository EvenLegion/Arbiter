import type { APIEmbed } from 'discord.js';

export type WelcomeMessage = {
	content?: string;
	embeds?: APIEmbed[];
};

type Params = {
	guildName: string;
	discordUserId: string;
	userAvatarUrl?: string;
	rulesChannelId?: string;
	recruitmentChannelId?: string;
	charterChannelId?: string;
	newPlayersChannelId?: string;
};

export function buildWelcomeMessage({
	guildName,
	discordUserId,
	userAvatarUrl,
	rulesChannelId,
	recruitmentChannelId,
	charterChannelId,
	newPlayersChannelId
}: Params): WelcomeMessage {
	const fields: APIEmbed['fields'] = [
		rulesChannelId && {
			name: 'Server-Rules',
			value: `Please make sure to read the <#${rulesChannelId}> channel to understand the server rules and guidelines.`,
			inline: true
		},
		recruitmentChannelId && {
			name: 'Recruitment',
			value: `If you are interested in joining the Even Legion, please check out the <#${recruitmentChannelId}> channel for more information.`,
			inline: true
		},
		charterChannelId && {
			name: 'Charter',
			value: `If you are interested in getting to know how the Even Legion operates, please check out the <#${charterChannelId}> channel to read our charter.`,
			inline: true
		},
		newPlayersChannelId && {
			name: 'New Players',
			value: `If you are new to the game, please check out the <#${newPlayersChannelId}>. This channel is dedicated to helping new players get started and answering any questions you may have.`,
			inline: true
		}
	].filter(Boolean) as APIEmbed['fields'];

	return {
		content: `<@${discordUserId}>`,
		embeds: [
			{
				color: 0xff3131,
				title: 'Welcome to the Even Legion!',
				description: `Hello <@${discordUserId}>, welcome to ${guildName}! \n \n`,
				fields,
				thumbnail: userAvatarUrl ? { url: userAvatarUrl } : undefined,
				timestamp: new Date().toISOString()
			}
		]
	};
}
