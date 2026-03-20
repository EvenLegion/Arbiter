import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import type { Client } from 'discord.js';
import { ENV_CONFIG, ENV_DISCORD } from '../config/env';
import { initializeDivisionCache } from '../integrations/prisma';
import { createListenerExecutionContext } from '../lib/logging/ingressExecutionContext';

@ApplyOptions<Listener.Options>({ event: 'clientReady', once: true })
export class ReadyListener extends Listener {
	public override async run(client: Client<true>) {
		const context = createListenerExecutionContext({
			eventName: 'clientReady',
			flow: 'listener.clientReady',
			bindings: {
				userTag: client.user.tag,
				userId: client.user.id
			}
		});
		const logger = context.logger;

		try {
			logger.info('runtime.gateway.ready');

			// Utilities are exposed in a post-login hook, which can run after `clientReady`.
			// Initialize the cache directly here to avoid startup race conditions.
			await initializeDivisionCache();

			logger.info(
				{
					guildId: ENV_DISCORD.DISCORD_GUILD_ID,
					redisHost: ENV_CONFIG.REDIS_HOST,
					redisPort: ENV_CONFIG.REDIS_PORT,
					divisionCacheRefreshCron: ENV_CONFIG.DIVISION_CACHE_REFRESH_CRON,
					eventTrackingTickIntervalSeconds: ENV_DISCORD.EVENT_TRACKING_INTERVAL_SECONDS
				},
				'runtime.initialized'
			);
			logger.debug('discord.listener.completed');
		} catch (error) {
			logger.error(
				{
					err: error
				},
				'discord.listener.failed'
			);
			throw error;
		}
	}
}
