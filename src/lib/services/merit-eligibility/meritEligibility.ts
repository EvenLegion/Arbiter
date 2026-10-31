export type MeritEligibility = 'eligible' | 'not_org_member' | 'unavailable';
export type ResolveMeritEligibility = (discordUserId: string) => Promise<MeritEligibility>;

export class MeritEligibilityError extends Error {
	public constructor(public readonly eligibility: Exclude<MeritEligibility, 'eligible'>) {
		super(eligibility === 'not_org_member' ? 'Not eligible for merit: not part of the org' : 'Merit eligibility unavailable. Please try again.');
		this.name = 'MeritEligibilityError';
	}
}
