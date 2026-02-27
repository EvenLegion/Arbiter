import { ScheduledTask } from '@sapphire/plugin-scheduled-tasks';
import { ENV_DISCORD } from '../config/env';
import { handleAuxVcActivityTick } from '../lib/features/voice/aux-vc/handleAuxVcActivityTick';
import { createExecutionContext } from '../lib/logging/executionContext';

export class AuxVcActivityTickTask extends ScheduledTask {
	public constructor(context: ScheduledTask.LoaderContext, options: ScheduledTask.Options) {
		super(context, {
			...options,
			interval: ENV_DISCORD.VC_ACTIVITY_TICK_SECONDS * 1_000
		});
	}

	public override async run() {
		if (!this.container.client.isReady()) {
			return;
		}

		const context = createExecutionContext({
			bindings: {
				flow: 'task.auxVcActivityTick'
			}
		});

		try {
			await handleAuxVcActivityTick({ context });
		} catch (error) {
			context.logger.error(
				{
					err: error
				},
				'auxVcActivityTick task failed'
			);
			throw error;
		}
	}
}

declare module '@sapphire/plugin-scheduled-tasks' {
	interface ScheduledTasks {
		auxVcActivityTick: never;
	}
}
