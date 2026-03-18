import { createCustomIdCodec } from '../../discord/interactions/customId';

export type DivisionSelectionAction = 'join' | 'leave';

type JoinDivisionSelection = { action: 'join'; code: string };
type LeaveDivisionSelection = { action: 'leave'; code: string };

export type ParsedDivisionSelection = JoinDivisionSelection | LeaveDivisionSelection;

export function parseDivisionSelectionCustomId(customId: string): ParsedDivisionSelection | null {
	return DIVISION_JOIN_CODEC.parse(customId) ?? DIVISION_LEAVE_CODEC.parse(customId);
}

export function buildDivisionSelectionCustomId({ action, code }: { action: DivisionSelectionAction; code: string }) {
	return action === 'join' ? DIVISION_JOIN_CODEC.build({ code }) : DIVISION_LEAVE_CODEC.build({ code });
}

const DIVISION_JOIN_CODEC = createCustomIdCodec<JoinDivisionSelection, { code: string }>({
	prefix: ['division', 'join'],
	parseParts: ([code]) => {
		if (!code) {
			return null;
		}

		return {
			action: 'join',
			code
		};
	},
	buildParts: ({ code }) => [code]
});

const DIVISION_LEAVE_CODEC = createCustomIdCodec<LeaveDivisionSelection, { code: string }>({
	prefix: ['division', 'leave'],
	parseParts: ([code]) => {
		if (!code) {
			return null;
		}

		return {
			action: 'leave',
			code
		};
	},
	buildParts: ({ code }) => [code]
});
