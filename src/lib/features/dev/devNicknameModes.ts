import type { NicknameTransformMode } from '../../services/bulk-nickname/nicknameTransform';

export const DEV_NICKNAME_MODE_CONFIG: ReadonlyArray<{
	mode: NicknameTransformMode;
	description: string;
}> = [
	{
		mode: 'remove-prefix',
		description: 'Remove division-style prefixes from nicknames for one user or all users in the DB.'
	},
	{
		mode: 'remove-suffix',
		description: 'Remove merit-rank suffixes from nicknames for one user or all users in the DB.'
	},
	{
		mode: 'reset',
		description: 'Reset nicknames to raw nickname values from the User table.'
	}
];
