import { createCustomIdCodec } from '../../discord/customId';

type ParseDivisionSelectionParams = {
	customId: string;
};

type JoinDivisionSelection = { action: 'join'; code: string };
type LeaveDivisionSelection = { action: 'leave'; code: string };

export type ParseDivisionSelectionResult = JoinDivisionSelection | LeaveDivisionSelection | null;

export function parseDivisionSelection({ customId }: ParseDivisionSelectionParams): ParseDivisionSelectionResult {
	return DIVISION_JOIN_CODEC.parse(customId) ?? DIVISION_LEAVE_CODEC.parse(customId);
}

export function buildDivisionSelectionCustomId({ action, code }: { action: 'join' | 'leave'; code: string }) {
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
