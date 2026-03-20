import { ScheduledTask } from '@sapphire/plugin-scheduled-tasks';
import { ENV_CONFIG } from '../config/env';
import { isRuntimeClientReady, refreshRuntimeDivisionCache } from '../integrations/sapphire/runtimeGateway';
import { createScheduledTaskExecutionContext } from '../lib/logging/ingressExecutionContext';

export class DivisionCacheRefreshTask extends ScheduledTask {
	public constructor(context: ScheduledTask.LoaderContext, options: ScheduledTask.Options) {
		super(context, {
			...options,
			pattern: ENV_CONFIG.DIVISION_CACHE_REFRESH_CRON
		});
	}

	public override async run() {
		if (!isRuntimeClientReady()) {
			return;
		}

		const context = createScheduledTaskExecutionContext({
			taskName: 'divisionCacheRefresh',
			flow: 'task.divisionCacheRefresh'
		});

		try {
			await refreshRuntimeDivisionCache();
			context.logger.debug('task.completed');
		} catch (error) {
			context.logger.error(
				{
					err: error
				},
				'task.failed'
			);
			throw error;
		}
	}
}

declare module '@sapphire/plugin-scheduled-tasks' {
	interface ScheduledTasks {
		divisionCacheRefresh: never;
	}
}
