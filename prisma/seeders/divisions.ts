import 'dotenv/config';

import { DivisionKind, PrismaClient } from '@prisma/client';

import { requiredEnv } from './utils';

type DivisionSeed = {
	code: string;
	name: string;
	kind: DivisionKind;
	displayNamePrefix?: string;
	showRank?: boolean;
	emojiName?: string;
	emojiId?: string;
	discordRoleId?: string;
};

const divisions: DivisionSeed[] = [
	{
		code: 'LGN',
		name: 'Legionnaire',
		kind: DivisionKind.LEGIONNAIRE,
		displayNamePrefix: 'LGN',
		showRank: true,
		emojiName: requiredEnv('LGN_EMOJI_NAME'),
		emojiId: requiredEnv('LGN_EMOJI_ID'),
		discordRoleId: requiredEnv('LGN_ROLE_ID')
	},
	{
		code: 'INT',
		name: 'Initiate',
		kind: DivisionKind.INITIATE,
		displayNamePrefix: 'INT',
		showRank: false,
		emojiName: requiredEnv('INT_EMOJI_NAME'),
		emojiId: requiredEnv('INT_EMOJI_ID'),
		discordRoleId: requiredEnv('INT_ROLE_ID')
	},
	{
		code: 'RES',
		name: 'Reserve',
		kind: DivisionKind.RESERVE,
		displayNamePrefix: 'RES',
		showRank: true,
		emojiName: requiredEnv('RES_EMOJI_NAME'),
		emojiId: requiredEnv('RES_EMOJI_ID'),
		discordRoleId: requiredEnv('RES_ROLE_ID')
	},
	{
		code: 'ANG',
		name: 'Angels',
		kind: DivisionKind.SPECIAL,
		displayNamePrefix: 'ANG',
		showRank: true,
		emojiName: requiredEnv('ANG_EMOJI_NAME'),
		emojiId: requiredEnv('ANG_EMOJI_ID'),
		discordRoleId: requiredEnv('ANG_ROLE_ID')
	},
	{
		code: 'CENT',
		name: 'Centurion',
		kind: DivisionKind.SPECIAL,
		showRank: true,
		emojiName: requiredEnv('CENT_EMOJI_NAME'),
		emojiId: requiredEnv('CENT_EMOJI_ID'),
		discordRoleId: requiredEnv('CENT_ROLE_ID')
	},
	{
		code: 'AMB',
		name: 'Ambassador',
		kind: DivisionKind.SPECIAL,
		showRank: false,
		emojiName: requiredEnv('AMB_EMOJI_NAME'),
		emojiId: requiredEnv('AMB_EMOJI_ID'),
		discordRoleId: requiredEnv('AMB_ROLE_ID')
	},
	{
		code: 'EXEC',
		name: 'Executive',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'EXEC',
		showRank: false,
		emojiName: requiredEnv('EXEC_EMOJI_NAME'),
		emojiId: requiredEnv('EXEC_EMOJI_ID'),
		discordRoleId: requiredEnv('EXEC_ROLE_ID')
	},
	{
		code: 'PRA',
		name: 'CMD ★',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'CMD ★',
		showRank: false,
		emojiName: requiredEnv('PRA_EMOJI_NAME'),
		emojiId: requiredEnv('PRA_EMOJI_ID'),
		discordRoleId: requiredEnv('PRA_ROLE_ID')
	},
	{
		code: 'SEC',
		name: 'Security',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'SEC',
		showRank: false,
		emojiName: requiredEnv('SEC_EMOJI_NAME'),
		emojiId: requiredEnv('SEC_EMOJI_ID'),
		discordRoleId: requiredEnv('SEC_ROLE_ID')
	},
	{
		code: 'TECH',
		name: 'Tech Dept',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'TECH',
		showRank: false,
		emojiName: requiredEnv('TECH_EMOJI_NAME'),
		emojiId: requiredEnv('TECH_EMOJI_ID'),
		discordRoleId: requiredEnv('TECH_ROLE_ID')
	},
	{
		code: 'CMD',
		name: 'Commander',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'CMD',
		showRank: false,
		emojiName: requiredEnv('CMD_EMOJI_NAME'),
		emojiId: requiredEnv('CMD_EMOJI_ID'),
		discordRoleId: requiredEnv('CMD_ROLE_ID')
	},
	{
		code: 'QRM',
		name: 'Quartermaster',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'QRM',
		showRank: false,
		emojiName: requiredEnv('QRM_EMOJI_NAME'),
		emojiId: requiredEnv('QRM_EMOJI_ID'),
		discordRoleId: requiredEnv('QRM_ROLE_ID')
	},
	{
		code: 'TIR',
		name: 'Tirones',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'TIR',
		showRank: false,
		emojiName: requiredEnv('TIR_EMOJI_NAME'),
		emojiId: requiredEnv('TIR_EMOJI_ID'),
		discordRoleId: requiredEnv('TIR_ROLE_ID')
	},
	{
		code: 'NVY-L',
		name: 'Navy Lancearius',
		kind: DivisionKind.LANCEARIUS,
		displayNamePrefix: 'NVY-L',
		showRank: true,
		emojiName: requiredEnv('NVY_L_EMOJI_NAME'),
		emojiId: requiredEnv('NVY_L_EMOJI_ID'),
		discordRoleId: requiredEnv('NVY_L_ROLE_ID')
	},
	{
		code: 'MRN-L',
		name: 'Marines Lancearius',
		kind: DivisionKind.LANCEARIUS,
		displayNamePrefix: 'MRN-L',
		showRank: true,
		emojiName: requiredEnv('MRN_L_EMOJI_NAME'),
		emojiId: requiredEnv('MRN_L_EMOJI_ID'),
		discordRoleId: requiredEnv('MRN_L_ROLE_ID')
	},
	{
		code: 'SUP-L',
		name: 'Support Lancearius',
		kind: DivisionKind.LANCEARIUS,
		displayNamePrefix: 'SUP-L',
		showRank: true,
		emojiName: requiredEnv('SUP_L_EMOJI_NAME'),
		emojiId: requiredEnv('SUP_L_EMOJI_ID'),
		discordRoleId: requiredEnv('SUP_L_ROLE_ID')
	},
	{
		code: 'NVY',
		name: 'Navy',
		kind: DivisionKind.NAVY,
		displayNamePrefix: 'NVY',
		showRank: true,
		emojiName: requiredEnv('NVY_EMOJI_NAME'),
		emojiId: requiredEnv('NVY_EMOJI_ID'),
		discordRoleId: requiredEnv('NVY_ROLE_ID')
	},
	{
		code: 'MRN',
		name: 'Marines',
		kind: DivisionKind.MARINES,
		displayNamePrefix: 'MRN',
		showRank: true,
		emojiName: requiredEnv('MRN_EMOJI_NAME'),
		emojiId: requiredEnv('MRN_EMOJI_ID'),
		discordRoleId: requiredEnv('MRN_ROLE_ID')
	},
	{
		code: 'SUP',
		name: 'Support',
		kind: DivisionKind.SUPPORT,
		displayNamePrefix: 'SUP',
		showRank: true,
		emojiName: requiredEnv('SUP_EMOJI_NAME'),
		emojiId: requiredEnv('SUP_EMOJI_ID'),
		discordRoleId: requiredEnv('SUP_ROLE_ID')
	}
];

export async function seedDivisions(prisma: PrismaClient) {
	for (const division of divisions) {
		await prisma.division.upsert({
			where: { code: division.code },
			update: division,
			create: division
		});
	}
}
