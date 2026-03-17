export function combineWhereConditions<TWhere extends Record<string, unknown>>({
	derivedWhere,
	where
}: {
	derivedWhere: TWhere;
	where?: TWhere;
}): TWhere | undefined {
	if (!where) {
		return derivedWhere;
	}

	return {
		AND: [derivedWhere, where]
	} as unknown as TWhere;
}
