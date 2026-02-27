import { ScheduledTask } from '@sapphire/plugin-scheduled-tasks';
import { ENV_CONFIG } from '../config/env';
import { container } from '@sapphire/framework';

export class DivisionCacheRefreshTask extends ScheduledTask {
	public constructor(context: ScheduledTask.LoaderContext, options: ScheduledTask.Options) {
		super(context, {
			...options,
			pattern: ENV_CONFIG.DIVISION_CACHE_REFRESH_CRON
		});
	}

	public override async run() {
		if (!container.client.isReady()) {
			return;
		}

		await container.utilities.divisionCache.refresh();
	}
}

declare module '@sapphire/plugin-scheduled-tasks' {
	interface ScheduledTasks {
		divisionCacheRefresh: never;
	}
}
