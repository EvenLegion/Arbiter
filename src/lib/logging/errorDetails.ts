export type ErrorDetails = {
	errorMessage: string;
	errorName?: string;
	errorCode?: string;
};

export function toErrorDetails(error: unknown): ErrorDetails {
	if (error instanceof Error) {
		const errorCode = Reflect.get(error, 'code');
		return {
			errorMessage: error.message,
			errorName: error.name,
			...(typeof errorCode === 'string' ? { errorCode } : {})
		};
	}

	if (typeof error === 'string') {
		return {
			errorMessage: error,
			errorName: 'Error'
		};
	}

	return {
		errorMessage: 'Unknown error'
	};
}

export function toErrorLogFields(error: unknown): { err: unknown } & ErrorDetails {
	return {
		err: error,
		...toErrorDetails(error)
	};
}
