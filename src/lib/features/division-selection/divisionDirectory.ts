import type { Division } from '@prisma/client';

import { divisionRepository } from '../../../integrations/prisma/repositories';

export async function resolveDivisionSelection({ value }: { value: string }) {
	const normalizedValue = value.trim().toLowerCase();
	if (normalizedValue.length === 0) {
		return null;
	}

	const divisions = await divisionRepository.listDivisions();

	return (
		divisions.find((division) => division.code.toLowerCase() === normalizedValue) ??
		divisions.find((division) => division.name.toLowerCase() === normalizedValue) ??
		divisions.find((division) => `${division.name} (${division.code})`.toLowerCase() === normalizedValue) ??
		null
	);
}

export async function buildDivisionAutocompleteChoices({ query }: { query: string }) {
	const divisions = await divisionRepository.listDivisions();
	const matches = divisions
		.filter((division) => query.length === 0 || division.name.toLowerCase().includes(query) || division.code.toLowerCase().includes(query))
		.sort((left, right) => sortDivisionsByQuery({ left, right, query }));

	return matches.slice(0, 25).map((division) => ({
		name: `${division.name} (${division.code})`.slice(0, 100),
		value: division.code
	}));
}

function sortDivisionsByQuery({ left, right, query }: { left: Division; right: Division; query: string }) {
	if (query.length === 0) {
		return left.name.localeCompare(right.name) || left.code.localeCompare(right.code);
	}

	const leftNameStarts = left.name.toLowerCase().startsWith(query);
	const rightNameStarts = right.name.toLowerCase().startsWith(query);
	if (leftNameStarts !== rightNameStarts) {
		return leftNameStarts ? -1 : 1;
	}

	const leftCodeStarts = left.code.toLowerCase().startsWith(query);
	const rightCodeStarts = right.code.toLowerCase().startsWith(query);
	if (leftCodeStarts !== rightCodeStarts) {
		return leftCodeStarts ? -1 : 1;
	}

	return left.name.localeCompare(right.name) || left.code.localeCompare(right.code);
}
