type CustomIdPart = string | number;

type CreateCustomIdCodecParams<TParsed, TBuild = TParsed> = {
	prefix: readonly string[];
	parseParts: (parts: string[]) => TParsed | null;
	buildParts: (input: TBuild) => readonly CustomIdPart[];
};

export type CustomIdCodec<TParsed, TBuild = TParsed> = {
	parse: (customId: string) => TParsed | null;
	build: (input: TBuild) => string;
	matches: (customId: string) => boolean;
};

export function createCustomIdCodec<TParsed, TBuild = TParsed>({
	prefix,
	parseParts,
	buildParts
}: CreateCustomIdCodecParams<TParsed, TBuild>): CustomIdCodec<TParsed, TBuild> {
	return {
		parse(customId: string) {
			const parts = extractCustomIdParts({
				customId,
				prefix
			});
			if (!parts) {
				return null;
			}

			return parseParts(parts);
		},
		build(input: TBuild) {
			return joinCustomId([...prefix, ...buildParts(input)]);
		},
		matches(customId: string) {
			return hasCustomIdPrefix({
				customId,
				prefix
			});
		}
	};
}

export function extractCustomIdParts({ customId, prefix }: { customId: string; prefix: readonly string[] }) {
	const parts = customId.split(':');
	if (!prefix.every((segment, index) => parts[index] === segment)) {
		return null;
	}

	return parts.slice(prefix.length);
}

export function hasCustomIdPrefix({ customId, prefix }: { customId: string; prefix: readonly string[] }) {
	const parts = customId.split(':');
	return prefix.length <= parts.length && prefix.every((segment, index) => parts[index] === segment);
}

export function joinCustomId(parts: readonly CustomIdPart[]) {
	return parts.map((part) => String(part)).join(':');
}
