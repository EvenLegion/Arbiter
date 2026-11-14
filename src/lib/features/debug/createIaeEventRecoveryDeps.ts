import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PermissionFlagsBits, REST, Routes, type Guild, type ThreadChannel, type APIMessage } from 'discord.js';
import { ENV_DISCORD } from '../../../config/env/discord';
import { getRedisClient } from '../../../integrations/redis/client';
import {
	acquireEventSessionOperationLock,
	releaseEventSessionOperationLock,
	startEventSessionOperationLockLease
} from '../../../integrations/redis/eventSessionOperationLock';
import {
	readIaeEventRecoveryState,
	persistIaeSnapshot,
	persistIaeReview
} from '../../../integrations/prisma/event/review/iaeEventRecoveryRepository';
import { getEventReviewPage } from '../../../integrations/prisma/event/review/getEventReviewPage';
import { buildEventReviewPayload } from '../event-merit/review/presentation/buildEventReviewPayload';
import {
	IAE_EVENT_ID,
	IAE_THREAD_ID,
	IAE_SNAPSHOT_PATH,
	requireIae,
	assertIaeReviewMessage,
	type IaeRecoveryDeps,
	type IaeRecoverySnapshot,
	type IaeReviewMessage
} from '../../services/event-recovery/iaeEventRecovery';

export function createIaeEventRecoveryDeps({ guild }: { guild: Guild; logger?: unknown }): IaeRecoveryDeps {
	let thread: ThreadChannel | undefined;
	const verifyRuntime = async (snapshot: IaeRecoverySnapshot) => {
		requireIae(guild.id === snapshot.guildId && guild.id === ENV_DISCORD.DISCORD_GUILD_ID, 'guild_mismatch');
		const channel = await guild.channels.fetch(IAE_THREAD_ID, { force: true });
		requireIae(channel?.isThread() && !channel.archived && !channel.locked && channel.guildId === guild.id, 'thread_unavailable');
		requireIae(channel.parentId, 'thread_parent_missing');
		await guild.channels.fetch(channel.parentId, { force: true });
		const bot = await guild.members.fetchMe();
		const permissions = channel.permissionsFor(bot);
		requireIae(
			permissions?.has([
				PermissionFlagsBits.ViewChannel,
				PermissionFlagsBits.ReadMessageHistory,
				PermissionFlagsBits.SendMessagesInThreads,
				PermissionFlagsBits.EmbedLinks
			]),
			'thread_permissions_missing'
		);
		thread = channel;
	};
	const findReviewMessages = async (snapshot: IaeRecoverySnapshot) => {
		await verifyRuntime(snapshot);
		requireIae(thread, 'thread_unavailable');
		const found: IaeReviewMessage[] = [];
		let before: string | undefined;
		for (let page = 0; page < 20; page++) {
			const batch = await thread.messages.fetch({ limit: 100, before, cache: false });
			for (const message of batch.values()) {
				if (message.author.id !== guild.client.user.id) continue;
				const embed = message.embeds.find((e) => e.title === 'Event Merit Review' && e.footer?.text === `Event session ID: ${IAE_EVENT_ID}`);
				if (!embed) continue;
				const result = {
					id: message.id,
					channelId: message.channelId,
					attendeeCount: Number(embed.fields.find((f) => f.name === 'Number of Attendees')?.value)
				};
				assertIaeReviewMessage(result);
				found.push(result);
				requireIae(found.length <= 1, 'multiple_review_messages');
			}
			if (batch.size < 100) return found;
			const last = batch.lastKey();
			requireIae(last && last !== before, 'history_cursor_stalled');
			before = last;
		}
		requireIae(false, 'history_scan_incomplete');
	};
	return {
		loadSnapshot: () => readFile(IAE_SNAPSHOT_PATH),
		verifyRuntime,
		readTracking: async () => {
			const redis = getRedisClient();
			const [participants, metadata, active] = await Promise.all([
				redis.hgetall('arbiter:event-tracking:participants:1011'),
				redis.hgetall('arbiter:event-tracking:session:1011'),
				redis.sismember('arbiter:event-tracking:active-sessions', '1011')
			]);
			return { participants, metadata, active: active === 1 };
		},
		readState: readIaeEventRecoveryState,
		findReviewMessages,
		acquireOperation: async () => {
			const token = randomUUID();
			const params = { eventSessionId: IAE_EVENT_ID, token };
			if (!(await acquireEventSessionOperationLock(params))) return null;
			const lease = startEventSessionOperationLockLease(params);
			return {
				ensureOwned: lease.ensureOwned,
				release: async () => {
					await lease.stop();
					await releaseEventSessionOperationLock(params);
				}
			};
		},
		persistSnapshot: persistIaeSnapshot,
		persistReview: async (snapshot, existing, lease) => {
			await verifyRuntime(snapshot);
			const page = await getEventReviewPage({ eventSessionId: IAE_EVENT_ID, page: 1 });
			requireIae(page && page.attendeeCount === 75 && page.eventSession.state === 'ENDED_PENDING_REVIEW', 'review_page_mismatch');
			const payload = buildEventReviewPayload({
				eventSessionId: IAE_EVENT_ID,
				state: page.eventSession.state,
				durationSeconds: 504,
				expectedEventDuration: 90,
				attendeeCount: 75,
				page: page.page,
				totalPages: page.totalPages,
				attendees: page.attendees,
				pageSize: page.pageSize
			});
			return persistIaeReview(snapshot, existing, lease, async () => {
				// Dedicated REST client: never leave an automatically retried/rate-limit-queued send behind a failed transaction.
				const rest = new REST({ version: '10', retries: 0, timeout: 10_000, rejectOnRateLimit: () => true }).setToken(
					ENV_DISCORD.DISCORD_TOKEN
				);
				const message = (await rest.post(Routes.channelMessages(IAE_THREAD_ID), {
					body: {
						embeds: payload.embeds.map((embed) => embed.toJSON()),
						components: payload.components.map((row) => row.toJSON()),
						allowed_mentions: { parse: [] },
						nonce: 'iae1011-recovery',
						enforce_nonce: true
					}
				})) as APIMessage;
				return {
					id: message.id,
					channelId: message.channel_id,
					attendeeCount: Number(
						message.embeds
							.find((e) => e.title === 'Event Merit Review' && e.footer?.text === `Event session ID: ${IAE_EVENT_ID}`)
							?.fields?.find((f) => f.name === 'Number of Attendees')?.value
					)
				};
			});
		}
	};
}
