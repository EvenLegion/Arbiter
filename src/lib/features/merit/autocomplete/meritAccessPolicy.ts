export function canStaffManageOtherUsersMerit({ isStaff }: { isStaff: boolean }) {
	return isStaff;
}

export function resolveMeritAutocompleteScope({ isStaff, forbidNonStaff = false }: { isStaff: boolean; forbidNonStaff?: boolean }) {
	if (canStaffManageOtherUsersMerit({ isStaff })) {
		return 'staff' as const;
	}

	return forbidNonStaff ? ('forbidden' as const) : ('self-only' as const);
}
