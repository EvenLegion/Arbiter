export type { GuildMemberSyncFailure, GuildMemberSyncResult } from './guildMemberSyncService';

export type GuildMemberSyncServiceContract = {
	syncGuildMembers: () => Promise<import('./guildMemberSyncService').GuildMemberSyncResult>;
};
