import 'dotenv/config';

import { DivisionKind, PrismaClient } from '@prisma/client';

import { optionalEnv, requiredEnv } from './utils';

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
		emojiName: optionalEnv('LGN_EMOJI_NAME'),
		emojiId: optionalEnv('LGN_EMOJI_ID'),
		discordRoleId: requiredEnv('LGN_ROLE_ID')
	},
	{
		code: 'INT',
		name: 'Initiate',
		kind: DivisionKind.INITIATE,
		displayNamePrefix: 'INT',
		showRank: false,
		emojiName: optionalEnv('INT_EMOJI_NAME'),
		emojiId: optionalEnv('INT_EMOJI_ID'),
		discordRoleId: requiredEnv('INT_ROLE_ID')
	},
	{
		code: 'RES',
		name: 'Reserve',
		kind: DivisionKind.RESERVE,
		displayNamePrefix: 'RES',
		showRank: true,
		emojiName: optionalEnv('RES_EMOJI_NAME'),
		emojiId: optionalEnv('RES_EMOJI_ID'),
		discordRoleId: requiredEnv('RES_ROLE_ID')
	},
	{
		code: 'ANG',
		name: 'Angels',
		kind: DivisionKind.SPECIAL,
		displayNamePrefix: 'ANG',
		showRank: true,
		emojiName: optionalEnv('ANG_EMOJI_NAME'),
		emojiId: optionalEnv('ANG_EMOJI_ID'),
		discordRoleId: requiredEnv('ANG_ROLE_ID')
	},
	{
		code: 'CENT',
		name: 'Centurion',
		kind: DivisionKind.SPECIAL,
		showRank: true,
		emojiName: optionalEnv('CENT_EMOJI_NAME'),
		emojiId: optionalEnv('CENT_EMOJI_ID'),
		discordRoleId: requiredEnv('CENT_ROLE_ID')
	},
	{
		code: 'OPT',
		name: 'Optio',
		kind: DivisionKind.SPECIAL,
		showRank: true,
		emojiName: optionalEnv('OPTIO_EMOJI_NAME'),
		emojiId: optionalEnv('OPTIO_EMOJI_ID'),
		discordRoleId: requiredEnv('OPTIO_ROLE_ID')
	},
	{
		code: 'AMB',
		name: 'Ambassador',
		kind: DivisionKind.SPECIAL,
		displayNamePrefix: 'AMB',
		showRank: false,
		emojiName: optionalEnv('AMB_EMOJI_NAME'),
		emojiId: optionalEnv('AMB_EMOJI_ID'),
		discordRoleId: requiredEnv('AMB_ROLE_ID')
	},
	{
		code: 'AFK',
		name: 'On Leave of Absence',
		kind: DivisionKind.SPECIAL,
		displayNamePrefix: 'AFK',
		showRank: true,
		emojiName: optionalEnv('ON_LEAVE_OF_ABSENCE_EMOJI_NAME'),
		emojiId: optionalEnv('ON_LEAVE_OF_ABSENCE_EMOJI_ID'),
		discordRoleId: requiredEnv('ON_LEAVE_OF_ABSENCE_ROLE_ID')
	},
	{
		code: 'EXEC',
		name: 'Executive',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'EXEC',
		showRank: false,
		emojiName: optionalEnv('EXEC_EMOJI_NAME'),
		emojiId: optionalEnv('EXEC_EMOJI_ID'),
		discordRoleId: requiredEnv('EXEC_ROLE_ID')
	},
	{
		code: 'PRA',
		name: 'CMD ★',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'CMD ★',
		showRank: false,
		emojiName: optionalEnv('PRA_EMOJI_NAME'),
		emojiId: optionalEnv('PRA_EMOJI_ID'),
		discordRoleId: requiredEnv('PRA_ROLE_ID')
	},
	{
		code: 'SEC',
		name: 'Security',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'SEC',
		showRank: false,
		emojiName: optionalEnv('SEC_EMOJI_NAME'),
		emojiId: optionalEnv('SEC_EMOJI_ID'),
		discordRoleId: requiredEnv('SEC_ROLE_ID')
	},
	{
		code: 'TECH',
		name: 'Tech Dept',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'TECH',
		showRank: false,
		emojiName: optionalEnv('TECH_EMOJI_NAME'),
		emojiId: optionalEnv('TECH_EMOJI_ID'),
		discordRoleId: requiredEnv('TECH_ROLE_ID')
	},
	{
		code: 'TECHDEPT',
		name: 'Tech Department',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'TECH',
		showRank: false,
		emojiName: optionalEnv('TECH_DEPARTMENT_EMOJI_NAME'),
		emojiId: optionalEnv('TECH_DEPARTMENT_EMOJI_ID'),
		discordRoleId: requiredEnv('TECH_DEPARTMENT_ROLE_ID')
	},
	{
		code: 'CMD',
		name: 'Commander',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'CMD',
		showRank: false,
		emojiName: optionalEnv('CMD_EMOJI_NAME'),
		emojiId: optionalEnv('CMD_EMOJI_ID'),
		discordRoleId: requiredEnv('CMD_ROLE_ID')
	},
	{
		code: 'CMDN',
		name: 'Navy Commander',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'CMD-N',
		showRank: false,
		emojiName: optionalEnv('CMD_NAVY_EMOJI_NAME'),
		emojiId: optionalEnv('CMD_NAVY_EMOJI_ID'),
		discordRoleId: requiredEnv('CMD_NAVY_ROLE_ID')
	},
	{
		code: 'CMDM',
		name: 'Marines Commander',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'CMD-M',
		showRank: false,
		emojiName: optionalEnv('CMD_MARINES_EMOJI_NAME'),
		emojiId: optionalEnv('CMD_MARINES_EMOJI_ID'),
		discordRoleId: requiredEnv('CMD_MARINES_ROLE_ID')
	},
	{
		code: 'CMDS',
		name: 'Support Commander',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'CMD-S',
		showRank: false,
		emojiName: optionalEnv('CMD_SUPPORT_EMOJI_NAME'),
		emojiId: optionalEnv('CMD_SUPPORT_EMOJI_ID'),
		discordRoleId: requiredEnv('CMD_SUPPORT_ROLE_ID')
	},
	{
		code: 'QRM',
		name: 'Quartermaster',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'QRM',
		showRank: false,
		emojiName: optionalEnv('QRM_EMOJI_NAME'),
		emojiId: optionalEnv('QRM_EMOJI_ID'),
		discordRoleId: requiredEnv('QRM_ROLE_ID')
	},
	{
		code: 'TIR',
		name: 'Tirones',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'TIR',
		showRank: false,
		emojiName: optionalEnv('TIR_EMOJI_NAME'),
		emojiId: optionalEnv('TIR_EMOJI_ID'),
		discordRoleId: requiredEnv('TIR_ROLE_ID')
	},
	{
		code: 'SOL',
		name: 'Staff on Leave',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'SOL',
		showRank: false,
		emojiName: optionalEnv('STAFF_ON_LEAVE_EMOJI_NAME'),
		emojiId: optionalEnv('STAFF_ON_LEAVE_EMOJI_ID'),
		discordRoleId: requiredEnv('STAFF_ON_LEAVE_ROLE_ID')
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
