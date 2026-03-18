import type { DivisionKind } from '@prisma/client';
import type { Guild, GuildMember } from 'discord.js';

export type CapabilityRequirement = 'none' | 'staff' | 'staff-or-centurion';

export type ActorCapabilityDeps = {
	getConfiguredGuild?: () => Promise<Guild>;
	getMember: (params: { guild: Guild; discordUserId: string }) => Promise<GuildMember>;
	hasDivisionKindRole: (params: { member: GuildMember; requiredRoleKinds: DivisionKind[] }) => Promise<boolean>;
	hasDivision: (params: { member: GuildMember; divisionDiscordRoleId: string }) => Promise<boolean>;
	getDbUser?: (params: { discordUserId: string }) => Promise<{ id: string }>;
	centurionRoleId: string;
};

export type ResolvedActorCapabilities = {
	isStaff: boolean;
	isCenturion: boolean;
};

export type ResolveActorCoreResult =
	| {
			kind: 'ok';
			guild: Guild;
			member: GuildMember;
			capabilities: ResolvedActorCapabilities;
			dbUser: { id: string } | null;
	  }
	| {
			kind: 'guild_not_found';
			error?: unknown;
	  }
	| {
			kind: 'member_not_found';
			error?: unknown;
	  }
	| {
			kind: 'insufficient_capability';
			guild: Guild;
			member: GuildMember;
			capabilities: ResolvedActorCapabilities;
	  }
	| {
			kind: 'db_user_not_found';
			guild: Guild;
			member: GuildMember;
			capabilities: ResolvedActorCapabilities;
			error?: unknown;
	  };
