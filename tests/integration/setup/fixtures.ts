import { DivisionKind, EventSessionState, MeritTypeCode, type PrismaClient } from '@prisma/client';

type CreateUserParams = {
	discordUserId: string;
	discordUsername?: string;
	discordNickname?: string;
	discordAvatarUrl?: string;
};

type CreateDivisionParams = {
	code: string;
	name?: string;
	kind?: DivisionKind;
	displayNamePrefix?: string | null;
	showRank?: boolean;
	discordRoleId?: string | null;
};

type CreateEventSessionParams = {
	hostUserId: string;
	threadId: string;
	name: string;
	state?: EventSessionState;
	eventTierCode?: MeritTypeCode;
	startedAt?: Date | null;
	endedAt?: Date | null;
	reviewFinalizedAt?: Date | null;
	reviewFinalizedByUserId?: string | null;
};

export async function createUser(
	prisma: PrismaClient,
	{ discordUserId, discordUsername = `user-${discordUserId}`, discordNickname = discordUsername, discordAvatarUrl }: CreateUserParams
) {
	return prisma.user.create({
		data: {
			discordUserId,
			discordUsername,
			discordNickname,
			discordAvatarUrl: discordAvatarUrl ?? `https://example.com/${discordUserId}.png`
		}
	});
}

export async function createDivision(
	prisma: PrismaClient,
	{
		code,
		name = code,
		kind = DivisionKind.LEGIONNAIRE,
		displayNamePrefix = code,
		showRank = true,
		discordRoleId = `${code.toLowerCase()}-role-id`
	}: CreateDivisionParams
) {
	return prisma.division.create({
		data: {
			code,
			name,
			kind,
			displayNamePrefix,
			showRank,
			discordRoleId
		}
	});
}

export async function createEventSession(
	prisma: PrismaClient,
	{
		hostUserId,
		threadId,
		name,
		state = EventSessionState.DRAFT,
		eventTierCode = MeritTypeCode.TIER_1,
		startedAt,
		endedAt,
		reviewFinalizedAt,
		reviewFinalizedByUserId
	}: CreateEventSessionParams
) {
	const eventTier = await prisma.eventTier.findUniqueOrThrow({
		where: {
			code: eventTierCode
		}
	});

	return prisma.event.create({
		data: {
			hostUserId,
			eventTierId: eventTier.id,
			threadId,
			name,
			state,
			startedAt: startedAt ?? undefined,
			endedAt: endedAt ?? undefined,
			reviewFinalizedAt: reviewFinalizedAt ?? undefined,
			reviewFinalizedByUserId: reviewFinalizedByUserId ?? undefined
		}
	});
}
