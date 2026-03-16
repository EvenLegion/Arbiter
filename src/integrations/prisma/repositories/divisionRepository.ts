import { createManyDivisionMembership } from '../createManyDivisionMembership';
import { deleteManyDivisionMembership } from '../deleteManyDivisionMembership';
import { findManyDivisionMemberships } from '../findManyDivisionMemberships';
import { findManyDivisions } from '../findManyDivisions';
import { findManyUsersDivisions } from '../findManyUsersDivisions';

export const divisionRepository = {
	listDivisions: findManyDivisions,
	listMemberships: findManyDivisionMemberships,
	listUserDivisions: findManyUsersDivisions,
	addMemberships: createManyDivisionMembership,
	removeMemberships: deleteManyDivisionMembership
};
