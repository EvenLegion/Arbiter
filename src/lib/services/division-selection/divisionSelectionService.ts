type SelectableDivision = {
	id: number;
	code: string;
	name: string;
	discordRoleId: string | null;
};

type DivisionSelectionServiceDeps = {
	listSelectableDivisions: () => Promise<SelectableDivision[]>;
	memberHasRole: (roleId: string) => boolean;
	removeRoles: (roleIds: string[], reason: string) => Promise<void>;
	addRole: (roleId: string, reason: string) => Promise<void>;
};

export type DivisionSelectionResult =
	| { kind: 'forbidden' }
	| { kind: 'division_not_found' }
	| { kind: 'already_member'; divisionName: string }
	| { kind: 'no_membership' }
	| {
			kind: 'joined';
			divisionId: number;
			divisionCode: string;
			divisionName: string;
			replacedRoleIds: string[];
	  }
	| {
			kind: 'left';
			removedDivisionIds: number[];
			removedDivisionNames: string[];
			removedRoleIds: string[];
	  };

export async function applyDivisionSelection(
	deps: DivisionSelectionServiceDeps,
	input: {
		action: 'join' | 'leave';
		selectedDivisionCode: string;
		isLegionnaire: boolean;
	}
): Promise<DivisionSelectionResult> {
	if (!input.isLegionnaire) {
		return {
			kind: 'forbidden'
		};
	}

	const divisions = await deps.listSelectableDivisions();
	const selectableDivisions = divisions.filter((division) => division.discordRoleId);

	if (input.action === 'leave') {
		const existingDivisions = selectableDivisions.filter((division) => deps.memberHasRole(division.discordRoleId!));
		if (existingDivisions.length === 0) {
			return {
				kind: 'no_membership'
			};
		}

		const removedRoleIds = existingDivisions.map((division) => division.discordRoleId!) as string[];
		await deps.removeRoles(removedRoleIds, 'Left division via button selection');

		return {
			kind: 'left',
			removedDivisionIds: existingDivisions.map((division) => division.id),
			removedDivisionNames: existingDivisions.map((division) => division.name),
			removedRoleIds
		};
	}

	const selectedDivision = selectableDivisions.find((division) => division.code === input.selectedDivisionCode.toUpperCase());
	if (!selectedDivision) {
		return {
			kind: 'division_not_found'
		};
	}

	if (deps.memberHasRole(selectedDivision.discordRoleId!)) {
		return {
			kind: 'already_member',
			divisionName: selectedDivision.name
		};
	}

	const replacedRoleIds = selectableDivisions
		.filter((division) => deps.memberHasRole(division.discordRoleId!))
		.map((division) => division.discordRoleId!) as string[];

	if (replacedRoleIds.length > 0) {
		await deps.removeRoles(replacedRoleIds, 'Replacing selectable division role via button selection');
	}

	await deps.addRole(selectedDivision.discordRoleId!, `Joined ${selectedDivision.name} division via button selection`);

	return {
		kind: 'joined',
		divisionId: selectedDivision.id,
		divisionCode: selectedDivision.code,
		divisionName: selectedDivision.name,
		replacedRoleIds
	};
}
