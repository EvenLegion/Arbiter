import { ScheduledTask } from '@sapphire/plugin-scheduled-tasks';
import { ENV_DISCORD } from '../config/env/discord';
import { isRuntimeClientReady } from '../integrations/sapphire/runtimeGateway';
import { createEventTrackingServiceDeps } from '../lib/features/event-merit/tracking/createEventTrackingServiceDeps';
import { createScheduledTaskExecutionContext } from '../lib/logging/ingressExecutionContext';
import { tickAllActiveEventTrackingSessions } from '../lib/services/event-tracking/eventTrackingService';

export class EventTrackingTickTask extends ScheduledTask {
	public constructor(context: ScheduledTask.LoaderContext, options: ScheduledTask.Options) {
		super(context, {
			...options,
			interval: ENV_DISCORD.EVENT_TRACKING_INTERVAL_SECONDS * 1_000
		});
	}

	public override async run() {
		if (!isRuntimeClientReady()) {
			return;
		}

		const context = createScheduledTaskExecutionContext({
			taskName: 'eventTrackingTick',
			flow: 'task.eventTrackingTick'
		});

		try {
			await tickAllActiveEventTrackingSessions(createEventTrackingServiceDeps(), {
				context
			});
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
		eventTrackingTick: never;
	}
}
