import { describe, expect, it, vi } from 'vitest';
import type { Guild, GuildMember } from 'discord.js';

import {
	buildGuildMemberAutocompleteChoices,
	findGuildMemberByInput,
	getGuildMemberByDiscordUserId,
	parseDiscordUserIdInput
} from '../../../../src/lib/discord/members/memberDirectory';

type MockGuildMember = Pick<GuildMember, 'id' | 'displayName' | 'nickname' | 'user'>;

describe('memberDirectory', () => {
	describe('parseDiscordUserIdInput', () => {
		it('extracts a discord user id from a mention', () => {
			expect(parseDiscordUserIdInput('<@123456789012345678>')).toBe('123456789012345678');
			expect(parseDiscordUserIdInput('<@!123456789012345678>')).toBe('123456789012345678');
		});

		it('returns a raw discord user id and rejects non-id input', () => {
			expect(parseDiscordUserIdInput('123456789012345678')).toBe('123456789012345678');
			expect(parseDiscordUserIdInput('not-a-user')).toBeUndefined();
			expect(parseDiscordUserIdInput(null)).toBeUndefined();
		});
	});

	describe('getGuildMemberByDiscordUserId', () => {
		it('prefers the cache and excludes bots by default', async () => {
			const cachedMember = buildMember({
				id: '123456789012345678',
				displayName: 'Alpha',
				isBot: true
			});
			const fetch = vi.fn();
			const guild = createGuild({
				cachedMembers: [cachedMember],
				fetch
			});

			await expect(
				getGuildMemberByDiscordUserId({
					guild,
					discordUserId: cachedMember.id
				})
			).resolves.toBeNull();
			expect(fetch).not.toHaveBeenCalled();
		});

		it('falls back to fetch when the member is not cached', async () => {
			const fetchedMember = buildMember({
				id: '223456789012345678',
				displayName: 'Fetched Alpha'
			});
			const fetch = vi.fn().mockImplementation(async (value: string) => {
				expect(value).toBe(fetchedMember.id);
				return fetchedMember;
			});
			const guild = createGuild({
				cachedMembers: [],
				fetch
			});

			await expect(
				getGuildMemberByDiscordUserId({
					guild,
					discordUserId: fetchedMember.id
				})
			).resolves.toBe(fetchedMember);
		});
	});

	describe('findGuildMemberByInput', () => {
		it('returns a unique exact match before considering loose matches', async () => {
			const exactMember = buildMember({
				id: '323456789012345678',
				displayName: 'Alpha Squad'
			});
			const looseMember = buildMember({
				id: '423456789012345678',
				displayName: 'The Alpha Squad Reserve'
			});
			const guild = createGuild({
				cachedMembers: [exactMember, looseMember],
				fetch: vi.fn().mockResolvedValue(new Map())
			});

			await expect(
				findGuildMemberByInput({
					guild,
					input: 'alpha squad'
				})
			).resolves.toBe(exactMember);
		});

		it('returns null when a loose query is ambiguous', async () => {
			const guild = createGuild({
				cachedMembers: [
					buildMember({
						id: '523456789012345678',
						displayName: 'Alpha One'
					}),
					buildMember({
						id: '623456789012345678',
						displayName: 'Alpha Two'
					})
				],
				fetch: vi.fn().mockResolvedValue(new Map())
			});

			await expect(
				findGuildMemberByInput({
					guild,
					input: 'alpha'
				})
			).resolves.toBeNull();
		});

		it('uses query fetch fallback when cache search has no unique match', async () => {
			const fetchedMember = buildMember({
				id: '723456789012345678',
				displayName: 'Bravo Squad'
			});
			const fetch = vi.fn().mockImplementation(async (value: string | { query: string; limit: number }) => {
				if (typeof value === 'string') {
					return null;
				}

				expect(value).toEqual({
					query: 'bravo squad',
					limit: 25
				});
				return new Map([[fetchedMember.id, fetchedMember]]);
			});
			const guild = createGuild({
				cachedMembers: [],
				fetch
			});

			await expect(
				findGuildMemberByInput({
					guild,
					input: 'bravo squad'
				})
			).resolves.toBe(fetchedMember);
		});

		it('falls back to a full member fetch when query fetch misses a differently-cased member', async () => {
			const fetchedMember = buildMember({
				id: '733456789012345678',
				displayName: 'Ciere'
			});
			const fetch = vi.fn().mockImplementation(async (value?: string | { query: string; limit: number }) => {
				if (typeof value === 'string') {
					return null;
				}
				if (value) {
					expect(value).toEqual({
						query: 'ciere',
						limit: 25
					});
					return new Map();
				}

				return new Map([[fetchedMember.id, fetchedMember]]);
			});
			const guild = createGuild({
				cachedMembers: [],
				fetch
			});

			await expect(
				findGuildMemberByInput({
					guild,
					input: 'ciere'
				})
			).resolves.toBe(fetchedMember);
			expect(fetch).toHaveBeenCalledTimes(2);
		});

		it('rejects bots during free-form lookup', async () => {
			const botMember = buildMember({
				id: '823456789012345678',
				displayName: 'Helper Bot',
				isBot: true
			});
			const guild = createGuild({
				cachedMembers: [botMember],
				fetch: vi.fn()
			});

			await expect(
				findGuildMemberByInput({
					guild,
					input: `<@${botMember.id}>`
				})
			).resolves.toBeNull();
		});
	});

	describe('buildGuildMemberAutocompleteChoices', () => {
		it('ranks exact and prefix matches ahead of loose matches and excludes bots', async () => {
			const guild = createGuild({
				cachedMembers: [
					buildMember({
						id: '923456789012345678',
						displayName: 'The Alpha'
					}),
					buildMember({
						id: '103456789012345678',
						displayName: 'Alpha'
					}),
					buildMember({
						id: '113456789012345678',
						displayName: 'Alpha Team'
					}),
					buildMember({
						id: '123456789012345679',
						displayName: 'Alpha Bot',
						isBot: true
					})
				],
				fetch: vi.fn()
			});

			await expect(
				buildGuildMemberAutocompleteChoices({
					guild,
					query: 'alpha'
				})
			).resolves.toEqual([
				{
					name: 'Alpha',
					value: '103456789012345678'
				},
				{
					name: 'Alpha Team',
					value: '113456789012345678'
				},
				{
					name: 'The Alpha',
					value: '923456789012345678'
				}
			]);
		});

		it('uses fetch fallback for autocomplete when the cache has no matches', async () => {
			const fetchedMember = buildMember({
				id: '133456789012345678',
				displayName: 'Gamma Squad'
			});
			const fetch = vi.fn().mockImplementation(async (value: string | { query: string; limit: number }) => {
				if (typeof value === 'string') {
					return null;
				}

				expect(value).toEqual({
					query: 'gamma',
					limit: 25
				});
				return new Map([[fetchedMember.id, fetchedMember]]);
			});
			const guild = createGuild({
				cachedMembers: [],
				fetch
			});

			await expect(
				buildGuildMemberAutocompleteChoices({
					guild,
					query: 'gamma'
				})
			).resolves.toEqual([
				{
					name: 'Gamma Squad',
					value: '133456789012345678'
				}
			]);
		});

		it('falls back to a full member fetch for autocomplete when query fetch misses case variants', async () => {
			const fetchedMember = buildMember({
				id: '143456789012345678',
				displayName: 'Ciere'
			});
			const fetch = vi.fn().mockImplementation(async (value?: string | { query: string; limit: number }) => {
				if (typeof value === 'string') {
					return null;
				}
				if (value) {
					expect(value).toEqual({
						query: 'ci',
						limit: 25
					});
					return new Map();
				}

				return new Map([[fetchedMember.id, fetchedMember]]);
			});
			const guild = createGuild({
				cachedMembers: [],
				fetch
			});

			await expect(
				buildGuildMemberAutocompleteChoices({
					guild,
					query: 'ci'
				})
			).resolves.toEqual([
				{
					name: 'Ciere',
					value: '143456789012345678'
				}
			]);
			expect(fetch).toHaveBeenCalledTimes(2);
		});
	});
});

function createGuild({ cachedMembers, fetch }: { cachedMembers: MockGuildMember[]; fetch: ReturnType<typeof vi.fn> }): Guild {
	return {
		members: {
			cache: new Map(cachedMembers.map((member) => [member.id, member])),
			fetch
		}
	} as unknown as Guild;
}

function buildMember({
	id,
	displayName,
	nickname,
	username = displayName.toLowerCase().replace(/\s+/g, '.'),
	globalName = null,
	isBot = false
}: {
	id: string;
	displayName: string;
	nickname?: string | null;
	username?: string;
	globalName?: string | null;
	isBot?: boolean;
}): MockGuildMember {
	return {
		id,
		displayName,
		nickname: nickname ?? null,
		user: {
			bot: isBot,
			globalName,
			username
		}
	} as MockGuildMember;
}
