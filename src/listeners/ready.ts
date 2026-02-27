import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import type { Client } from 'discord.js';
import { reconcileEligibility } from '../lib/features/voice/aux-vc/reconcileEligibility';
import { ENV_CONFIG, ENV_DISCORD } from '../config/env';
import { createExecutionContext } from '../lib/logging/executionContext';

@ApplyOptions<Listener.Options>({ event: 'clientReady', once: true })
export class ReadyListener extends Listener {
	public override async run(client: Client<true>) {
		try {
			this.container.logger.info(
				{
					userTag: client.user.tag,
					userId: client.user.id
				},
				'Discord gateway ready'
			);

			await this.container.utilities.divisionCache.refresh();
			await reconcileEligibility({
				context: createExecutionContext({
					bindings: {
						flow: 'listener.ready.reconcileEligibility',
						guildId: ENV_DISCORD.DISCORD_GUILD_ID
					}
				})
			});

			this.container.logger.info(
				{
					guildId: ENV_DISCORD.DISCORD_GUILD_ID,
					redisHost: ENV_CONFIG.REDIS_HOST,
					redisPort: ENV_CONFIG.REDIS_PORT,
					divisionCacheRefreshCron: ENV_CONFIG.DIVISION_CACHE_REFRESH_CRON,
					vcTickIntervalSeconds: ENV_DISCORD.VC_ACTIVITY_TICK_SECONDS
				},
				'Arbiter runtime initialized'
			);
		} catch (error) {
			this.container.logger.error(
				{
					err: error
				},
				'Failed during ready listener initialization'
			);
			throw error;
		}
	}
}
