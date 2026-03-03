import { ScheduledTask } from '@sapphire/plugin-scheduled-tasks';
import { ENV_DISCORD } from '../config/env/discord';
import { createExecutionContext } from '../lib/logging/executionContext';

export class EventTrackingTickTask extends ScheduledTask {
	public constructor(context: ScheduledTask.LoaderContext, options: ScheduledTask.Options) {
		super(context, {
			...options,
			interval: ENV_DISCORD.EVENT_TRACKING_INTERVAL_SECONDS * 1_000
		});
	}

	public override async run() {
		if (!this.container.client.isReady()) {
			return;
		}

		const context = createExecutionContext({
			bindings: {
				flow: 'task.eventTrackingTick'
			}
		});

		try {
			await this.container.utilities.eventTracking.tickAllActiveSessions({
				context
			});
		} catch (error) {
			context.logger.error(
				{
					err: error
				},
				'eventTrackingTick task failed'
			);
			throw error;
		}
	}
}

declare module '@sapphire/plugin-scheduled-tasks' {
	interface ScheduledTasks {
		eventTrackingTick: never;
	}
}
