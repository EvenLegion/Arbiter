import type { APIActionRowComponent, APIButtonComponent, APIEmbed } from 'discord.js';
import { type Division } from '@prisma/client';

import { ENV_DISCORD } from '../../../config/env/discord';

type DivisionSelectionMessage = {
	embeds: APIEmbed[];
	components: APIActionRowComponent<APIButtonComponent>[];
};

type BuildDivisionSelectionMessageParams = {
	divisions: Division[];
};

const SELECTABLE_DIVISIONS = {
	NVY: [
		"**The Legion's aerospace combat force**",
		`<@&${ENV_DISCORD.NVY_ROLE_ID}> secure and dominate the battlespace above the fight through fighter cover, gunship firepower, escort, interdiction, and rapid transport where it matters most.`,
		'In this Division, you might: fly fighters/interceptors, crew gunships, escort dropships/transports, provide close air support, run strike missions, and move personnel or cargo under threat.'
	],
	MRN: [
		"**The Legion's ground assault force**",
		`<@&${ENV_DISCORD.MRN_ROLE_ID}> seize and hold objectives through coordinated infantry and armored action, from bunker clears to hard-point pushes in contested zones.`,
		'In this Division, you might: breach bunkers, assault fortified positions, operate tanks/ground vehicles, secure objectives, hold defensive lines, and execute mechanized infantry operations.'
	],
	SUP: [
		"**The Legion's logistics and sustainment force**",
		`<@&${ENV_DISCORD.SUP_ROLE_ID}> keeps the Legion operational by supplying fuel, materials, repairs, and economic throughput across mining, salvage, transport, trade, and engineering.`,
		'In this Division, you might: mine/refine resources, salvage wrecks, haul cargo, coordinate logistics, run trade routes, maintain/repair ships, refuel forces, and support infrastructure/crafting operations.'
	]
};

export function buildDivisionSelectionMessage({ divisions }: BuildDivisionSelectionMessageParams): DivisionSelectionMessage {
	const divisionsEmbed: APIEmbed = {
		title: 'DIVISION SELECTION',
		description: `_Only <@&${ENV_DISCORD.LGN_ROLE_ID}> may select. You may choose **ONE** division._\n\n`,
		color: 0x3b82f6,
		fields: [{ name: '\u200B', value: '', inline: false }]
	};
	const divisionButtons: APIButtonComponent[] = [];

	const instructionsEmbed: APIEmbed = {
		title: '📌 DIVISION SELECTION INSTRUCTIONS',
		color: 0xf59e0b,
		description: [
			'✅ Click a division button to join your division.',
			'',
			'🔄 Click a different division button to switch divisions.',
			'',
			'❌ Click _Leave Division_ to leave your division.',
			''
		].join('\n')
	};

	divisions.forEach((division) => {
		if (Object.prototype.hasOwnProperty.call(SELECTABLE_DIVISIONS, division.code)) {
			const [overview, summary, activities] = SELECTABLE_DIVISIONS[division.code as keyof typeof SELECTABLE_DIVISIONS];
			divisionsEmbed.fields!.push({
				name: `${division.emojiName ? `<:${division.emojiName}:${division.emojiId}> ` : ''}**Division: ${division.name}**`,
				value: [overview, summary, activities].filter(Boolean).join('\n\n'),
				inline: false
			});

			divisionsEmbed.fields!.push({
				name: '\u200B',
				value: '',
				inline: false
			});

			divisionButtons.push({
				type: 2,
				custom_id: `division:join:${division.code}`,
				label: division.name,
				style: 1, // PRIMARY (blurple)
				emoji: {
					id: division.emojiId ?? undefined,
					name: division.emojiName ?? undefined
				}
			});
		}
	});

	return {
		embeds: [divisionsEmbed, instructionsEmbed],
		components: toRows(divisionButtons)
	};
}

function toRows(divisionButtons: APIButtonComponent[]): APIActionRowComponent<APIButtonComponent>[] {
	const rows: APIActionRowComponent<APIButtonComponent>[] = [];
	const leaveDivisionButton: APIButtonComponent = {
		type: 2,
		style: 4, // DANGER (red)
		custom_id: 'division:leave:any',
		label: 'Leave Division'
	};

	if (divisionButtons.length > 0) {
		rows.push({ type: 1, components: [...divisionButtons, leaveDivisionButton] });
		return rows;
	}

	rows.push({
		type: 1,
		components: [leaveDivisionButton]
	});

	return rows;
}
