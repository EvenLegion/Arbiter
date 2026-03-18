import { stripTrailingMeritRankSuffix } from '../nickname/stripTrailingMeritRankSuffix';

export const NICKNAME_TRANSFORM_MODES = ['remove-prefix', 'remove-suffix', 'reset'] as const;

export type NicknameTransformMode = (typeof NICKNAME_TRANSFORM_MODES)[number];

export function isNicknameTransformMode(value: string): value is NicknameTransformMode {
	return NICKNAME_TRANSFORM_MODES.includes(value as NicknameTransformMode);
}

export function resolveNicknameTransformSetReason(mode: NicknameTransformMode): string {
	switch (mode) {
		case 'remove-prefix':
			return 'Development nickname remove-prefix';
		case 'remove-suffix':
			return 'Development nickname remove-suffix';
		case 'reset':
			return 'Development nickname reset';
	}
}

export function computeTransformedNickname({
	mode,
	currentNickname,
	rawNickname
}: {
	mode: NicknameTransformMode;
	currentNickname: string;
	rawNickname: string;
}): string {
	switch (mode) {
		case 'remove-prefix': {
			const withoutPrefix = stripLeadingPrefixSegments(currentNickname);
			return withoutPrefix.length > 0 ? withoutPrefix : currentNickname;
		}
		case 'remove-suffix':
			return stripTrailingMeritRankSuffix(currentNickname);
		case 'reset':
			return rawNickname.trim();
	}
}

export function stripLeadingPrefixSegments(value: string): string {
	const trimmed = value.trim();
	return trimmed.replace(/^(?:[^|]+\|\s*)+/u, '').trim();
}
