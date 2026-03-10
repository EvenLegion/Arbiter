type ParseDivisionSelectionParams = {
	customId: string;
};

export type ParseDivisionSelectionResult = { action: 'join'; code: string } | { action: 'leave'; code: string } | null;

export function parseDivisionSelection({ customId }: ParseDivisionSelectionParams): ParseDivisionSelectionResult {
	const [scope, action, code] = customId.split(':');

	if (scope !== 'division' || !action || !code) {
		return null;
	}

	if (action === 'join') {
		return { action: 'join', code };
	}

	if (action === 'leave') {
		return { action: 'leave', code };
	}

	return null;
}
