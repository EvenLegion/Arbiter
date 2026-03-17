import type { DivisionKind } from '@prisma/client';
import type { Guild, GuildMember } from 'discord.js';

import type { ActorContext } from '../services/_shared/actor';
import type { InteractionResponder } from './interactionResponder';

export type InteractionPreflightLogger = {
	error: (...values: readonly unknown[]) => void;
};

export type InteractionPreflightDeps = {
	getConfiguredGuild: () => Promise<Guild>;
	getMember: (params: { guild: Guild; discordUserId: string }) => Promise<GuildMember>;
	hasDivisionKindRole: (params: { member: GuildMember; requiredRoleKinds: DivisionKind[] }) => Promise<boolean>;
	hasDivision: (params: { member: GuildMember; divisionDiscordRoleId: string }) => Promise<boolean>;
	getDbUser: (params: { discordUserId: string }) => Promise<{ id: string }>;
	centurionRoleId: string;
};

export type ResolveConfiguredGuildParams = {
	interaction: {
		guild?: Guild | null;
	};
	responder: InteractionResponder;
	logger: InteractionPreflightLogger;
	logMessage: string;
	failureMessage: string;
	requestId?: boolean;
};

export type ResolveGuildMemberParams = {
	guild: Guild;
	discordUserId: string;
	responder: InteractionResponder;
	logger: InteractionPreflightLogger;
	logMessage: string;
	failureMessage: string;
	requestId?: boolean;
};

export type ResolveInteractionActorParams = ResolveGuildMemberParams & {
	capabilityRequirement?: 'none' | 'staff' | 'staff-or-centurion';
	resolveDbUser?: boolean;
	dbUserFailureMessage?: string;
	unauthorizedMessage?: string;
	discordTag?: string;
};

export type ResolvedInteractionActor = {
	member: GuildMember;
	dbUser: { id: string } | null;
	actor: ActorContext;
};
