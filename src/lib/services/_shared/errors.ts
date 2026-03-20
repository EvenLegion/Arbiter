export class InvariantViolationError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'InvariantViolationError';
	}
}
