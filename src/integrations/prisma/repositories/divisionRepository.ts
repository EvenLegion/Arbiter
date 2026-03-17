import { findManyDivisionMemberships, findManyDivisions, findManyUsersDivisions } from '../division/read';
import { createManyDivisionMembership, deleteManyDivisionMembership } from '../division/write';

export const divisionRepository = {
	listDivisions: findManyDivisions,
	listMemberships: findManyDivisionMemberships,
	listUserDivisions: findManyUsersDivisions,
	addMemberships: createManyDivisionMembership,
	removeMemberships: deleteManyDivisionMembership
};
