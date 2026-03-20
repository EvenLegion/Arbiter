export type KindedResult<TKind extends string, TPayload extends object = Record<never, never>> = {
	kind: TKind;
} & TPayload;
