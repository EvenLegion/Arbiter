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
		code: 'AUX',
		name: 'Auxiliary',
		kind: DivisionKind.AUXILIARY,
		displayNamePrefix: 'AUX',
		showRank: false,
		emojiName: requiredEnv('AUX_EMOJI_NAME'),
		emojiId: requiredEnv('AUX_EMOJI_ID'),
		discordRoleId: requiredEnv('AUX_ROLE_ID')
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
		code: 'CMDR',
		name: 'Commander',
		kind: DivisionKind.STAFF,
		displayNamePrefix: 'CMDR',
		showRank: false,
		emojiName: requiredEnv('CMDR_EMOJI_NAME'),
		emojiId: requiredEnv('CMDR_EMOJI_ID'),
		discordRoleId: requiredEnv('CMDR_ROLE_ID')
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
		code: 'HL-L',
		name: 'H.A.L.O. Lancearius',
		kind: DivisionKind.LANCEARIUS,
		displayNamePrefix: 'HL-L',
		showRank: true,
		emojiName: requiredEnv('HL_L_EMOJI_NAME'),
		emojiId: requiredEnv('HL_L_EMOJI_ID'),
		discordRoleId: requiredEnv('HL_L_ROLE_ID')
	},
	{
		code: 'HV-L',
		name: 'H.A.V.O.K. Lancearius',
		kind: DivisionKind.LANCEARIUS,
		displayNamePrefix: 'HV-L',
		showRank: true,
		emojiName: requiredEnv('HV_L_EMOJI_NAME'),
		emojiId: requiredEnv('HV_L_EMOJI_ID'),
		discordRoleId: requiredEnv('HV_L_ROLE_ID')
	},
	{
		code: 'VN-L',
		name: 'V.A.N.G.U.A.R.D. Lancearius',
		kind: DivisionKind.LANCEARIUS,
		displayNamePrefix: 'VN-L',
		showRank: true,
		emojiName: requiredEnv('VN_L_EMOJI_NAME'),
		emojiId: requiredEnv('VN_L_EMOJI_ID'),
		discordRoleId: requiredEnv('VN_L_ROLE_ID')
	},
	{
		code: 'HLO',
		name: 'H.A.L.O.',
		kind: DivisionKind.COMBAT,
		displayNamePrefix: 'HLO',
		showRank: true,
		emojiName: requiredEnv('HLO_EMOJI_NAME'),
		emojiId: requiredEnv('HLO_EMOJI_ID'),
		discordRoleId: requiredEnv('HLO_ROLE_ID')
	},
	{
		code: 'VNG',
		name: 'V.A.N.G.U.A.R.D.',
		kind: DivisionKind.COMBAT,
		displayNamePrefix: 'VNG',
		showRank: true,
		emojiName: requiredEnv('VNG_EMOJI_NAME'),
		emojiId: requiredEnv('VNG_EMOJI_ID'),
		discordRoleId: requiredEnv('VNG_ROLE_ID')
	},
	{
		code: 'HVK',
		name: 'H.A.V.O.K.',
		kind: DivisionKind.COMBAT,
		displayNamePrefix: 'HVK',
		showRank: true,
		emojiName: requiredEnv('HVK_EMOJI_NAME'),
		emojiId: requiredEnv('HVK_EMOJI_ID'),
		discordRoleId: requiredEnv('HVK_ROLE_ID')
	},
	{
		code: 'DRL',
		name: 'D.R.I.L.L.',
		kind: DivisionKind.INDUSTRIAL,
		displayNamePrefix: 'DRL',
		showRank: true,
		emojiName: requiredEnv('DRL_EMOJI_NAME'),
		emojiId: requiredEnv('DRL_EMOJI_ID'),
		discordRoleId: requiredEnv('DRL_ROLE_ID')
	},
	{
		code: 'SCR',
		name: 'S.C.R.A.P.',
		kind: DivisionKind.INDUSTRIAL,
		displayNamePrefix: 'SCR',
		showRank: true,
		emojiName: requiredEnv('SCR_EMOJI_NAME'),
		emojiId: requiredEnv('SCR_EMOJI_ID'),
		discordRoleId: requiredEnv('SCR_ROLE_ID')
	},
	{
		code: 'LOG',
		name: 'L.O.G.I.',
		kind: DivisionKind.INDUSTRIAL,
		displayNamePrefix: 'LOG',
		showRank: true,
		emojiName: requiredEnv('LOG_EMOJI_NAME'),
		emojiId: requiredEnv('LOG_EMOJI_ID'),
		discordRoleId: requiredEnv('LOG_ROLE_ID')
	},
	{
		code: 'TRD',
		name: 'T.R.A.D.E.',
		kind: DivisionKind.INDUSTRIAL,
		displayNamePrefix: 'TRD',
		showRank: true,
		emojiName: requiredEnv('TRD_EMOJI_NAME'),
		emojiId: requiredEnv('TRD_EMOJI_ID'),
		discordRoleId: requiredEnv('TRD_ROLE_ID')
	},
	{
		code: 'ARC',
		name: 'A.R.C.H.',
		kind: DivisionKind.INDUSTRIAL,
		displayNamePrefix: 'ARC',
		showRank: true,
		emojiName: requiredEnv('ARC_EMOJI_NAME'),
		emojiId: requiredEnv('ARC_EMOJI_ID'),
		discordRoleId: requiredEnv('ARC_ROLE_ID')
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
