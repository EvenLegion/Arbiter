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

const DIVISION_DISPLAY_COLOR = 0x3b82f6;
const UNIFORMS_URL = 'https://www.evenlegion.space/uniforms';

const SELECTABLE_DIVISIONS = {
	NVY: [
		'Navy is Even Legion’s space and air combat force. From high-speed fighter superiority to multi-crew gunship support and strategic transport, Navy projects power wherever the Legion needs it. These members secure the skies, escort friendly forces, move critical assets, and deliver overwhelming force across the battlespace.',
		'In this Division, you might: fly fighters or interceptors, crew gunships, escort dropships and transports, provide air cover, conduct strike operations, move cargo or personnel, and support fleet or planetary combat operations.'
	],
	MRN: [
		'Marines are Even Legion’s frontline assault force. They lead bunker breaches, fortified assaults, armored advances, and boots-on-the-ground operations to capture, clear, and hold key objectives. When the Legion needs disciplined force on the surface, Marines are first in.',
		'In this Division, you might: clear bunkers, assault hostile positions, operate tanks or ground vehicles, secure objectives, hold defensive lines, and fight in coordinated infantry or mechanized operations.'
	],
	SUP: [
		'Support keeps Even Legion fighting, building, and growing. This branch powers the organization through mining, salvage, cargo transport, trade, engineering, repair, refueling, and future construction systems. Whether extracting raw resources, reclaiming battlefield wreckage, moving critical supplies, or optimizing profitable routes, Support ensures the Legion stays supplied and self-sustaining.',
		'In this Division, you might: mine and refine resources, salvage wrecks, haul cargo, coordinate logistics, run trade routes, repair and maintain ships, refuel friendly forces, and contribute to future crafting, engineering, and infrastructure efforts'
	]
};

export function buildDivisionSelectionMessage({ divisions }: BuildDivisionSelectionMessageParams): DivisionSelectionMessage {
	const divisionsEmbed: APIEmbed = {
		title: 'DIVISION SELECTION',
		description: `_Only <@&${ENV_DISCORD.LGN_ROLE_ID}> may select. You may choose **ONE** division._\n\n`,
		color: DIVISION_DISPLAY_COLOR,
		fields: []
	};
	const divisionButtons: APIButtonComponent[] = [];

	const instructionsEmbed: APIEmbed = {
		title: 'DIVISION INSTRUCTIONS',
		description: [
			'Click a division button to join your division.',
			'',
			'Click a different division button to switch divisions.',
			'',
			'Click _Leave Navy_ to leave your Navy division.',
			'',
			'Click _Leave Marines_ to leave your Marines division.',
			'',
			'Click _Leave Support_ to leave your Support division.',
			'',
			'Click _View Uniforms_ to view approved Legion armor sets.'
		].join('\n')
	};

	divisions.forEach((division) => {
		if (Object.prototype.hasOwnProperty.call(SELECTABLE_DIVISIONS, division.code)) {
			const [description, activities] = SELECTABLE_DIVISIONS[division.code as keyof typeof SELECTABLE_DIVISIONS];
			divisionsEmbed.fields!.push({
				name: division.name,
				value: `${description}\n\n${activities}`,
				inline: false
			});

			divisionButtons.push({
				type: 2,
				custom_id: `division:join:${division.code}`,
				label: division.name,
				style: 1
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

	if (divisionButtons.length > 0) {
		rows.push({ type: 1, components: divisionButtons });
	}

	rows.push({
		type: 1,
		components: [
			{
				type: 2,
				style: 5, // LINK
				label: 'View Uniforms',
				url: UNIFORMS_URL,
				emoji: { name: 'ℹ️' }
			},
			{
				type: 2,
				style: 4, // DANGER (red)
				custom_id: 'division:leave:NVY',
				label: 'Leave Navy'
			},
			{
				type: 2,
				style: 4, // DANGER (red)
				custom_id: 'division:leave:MRN',
				label: 'Leave Marines'
			},
			{
				type: 2,
				style: 4, // DANGER (red)
				custom_id: 'division:leave:SUP',
				label: 'Leave Support'
			}
		]
	});

	return rows;
}
