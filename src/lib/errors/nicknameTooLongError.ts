import { DISCORD_MAX_NICKNAME_LENGTH } from '../constants';

type NicknameTooLongErrorParams = {
	computedNickname: string;
	computedLength: number;
};

export class NicknameTooLongError extends Error {
	public readonly computedNickname: string;
	public readonly computedLength: number;
	public readonly maxLength: number = DISCORD_MAX_NICKNAME_LENGTH;

	public constructor({ computedNickname, computedLength }: NicknameTooLongErrorParams) {
		super(`Computed nickname exceeds Discord limit (${DISCORD_MAX_NICKNAME_LENGTH}): length=${computedLength} nickname="${computedNickname}"`);
		this.name = 'NicknameTooLongError';
		this.computedNickname = computedNickname;
		this.computedLength = computedLength;
	}
}

export function isNicknameTooLongError(error: unknown): error is NicknameTooLongError {
	return error instanceof NicknameTooLongError;
}
