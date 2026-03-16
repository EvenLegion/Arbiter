import { ENV_DISCORD } from '../../../config/env/discord';
import type { DivisionSelectionResult } from '../../services/division-selection/divisionSelectionService';

export function buildDivisionSelectionReply({ result, requestId }: { result: DivisionSelectionResult; requestId: string }) {
	switch (result.kind) {
		case 'forbidden':
			return `Only <@&${ENV_DISCORD.LGN_ROLE_ID}> members can select a division. Please contact a TECH member with the following: requestId=${requestId}`;
		case 'division_not_found':
			return `There was an error processing your selection. Please contact a TECH member with the following: requestId=${requestId}`;
		case 'already_member':
			return `You are already a member of the ${result.divisionName} division.`;
		case 'no_membership':
			return 'You are not currently a member of any division.';
		case 'joined':
			return `You have joined the ${result.divisionName} division.`;
		case 'left':
			return 'Removed your division membership.';
	}
}
