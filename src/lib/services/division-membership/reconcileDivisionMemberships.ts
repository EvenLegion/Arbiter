export type ReconciledDivision = {
	id: number;
	name: string | undefined;
	discordRoleId: string | null | undefined;
};

type ReconcileDivisionMembershipsDeps = {
	listTrackedDivisions: () => Promise<ReconciledDivision[]>;
	listUserDivisions: (params: { discordUserId: string }) => Promise<ReconciledDivision[]>;
	addMemberships: (params: { discordUserId: string; divisionIds: number[] }) => Promise<void>;
	removeMemberships: (params: { discordUserId: string; divisionIds: number[] }) => Promise<void>;
};

export type ReconcileDivisionMembershipsResult = {
	addedDivisions: ReconciledDivision[];
	removedDivisions: ReconciledDivision[];
};

export async function reconcileDivisionMemberships(
	deps: ReconcileDivisionMembershipsDeps,
	input: {
		discordUserId: string;
		currentRoleIds: Iterable<string>;
	}
): Promise<ReconcileDivisionMembershipsResult> {
	const currentRoleIds = new Set(input.currentRoleIds);
	const trackedDivisions = await deps.listTrackedDivisions();
	const desiredDivisionIds = trackedDivisions
		.filter((division) => division.discordRoleId && currentRoleIds.has(division.discordRoleId))
		.map((division) => division.id);
	const existingMembershipDivisions = await deps.listUserDivisions({
		discordUserId: input.discordUserId
	});
	const existingMembershipDivisionIds = new Set(existingMembershipDivisions.map((division) => division.id));

	const addedDivisionIds = desiredDivisionIds.filter((divisionId) => !existingMembershipDivisionIds.has(divisionId));
	const removedDivisionIds = existingMembershipDivisions
		.filter((division) => !desiredDivisionIds.includes(division.id))
		.map((division) => division.id);

	if (addedDivisionIds.length > 0) {
		await deps.addMemberships({
			discordUserId: input.discordUserId,
			divisionIds: addedDivisionIds
		});
	}
	if (removedDivisionIds.length > 0) {
		await deps.removeMemberships({
			discordUserId: input.discordUserId,
			divisionIds: removedDivisionIds
		});
	}

	return {
		addedDivisions: addedDivisionIds.map((divisionId) => trackedDivisions.find((division) => division.id === divisionId)!),
		removedDivisions: removedDivisionIds.map(
			(divisionId) =>
				trackedDivisions.find((division) => division.id === divisionId) ??
				existingMembershipDivisions.find((division) => division.id === divisionId)!
		)
	};
}
