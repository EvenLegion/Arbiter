import { describe, expect, it } from 'vitest';

import { SCHEDULED_TASK_JOB_RETENTION, createScheduledTaskBullOptions } from '../../../src/config/scheduledTaskQueue';

describe('scheduled task queue configuration', () => {
	it('applies explicit age and count bounds to completed and failed jobs', () => {
		const connection = {
			host: 'redis.test',
			port: 6379,
			password: 'test-password',
			db: 3
		};

		expect(createScheduledTaskBullOptions(connection)).toEqual({
			connection,
			defaultJobOptions: {
				removeOnComplete: {
					age: 86_400,
					count: 5_000
				},
				removeOnFail: {
					age: 604_800,
					count: 1_000
				}
			}
		});
		expect(SCHEDULED_TASK_JOB_RETENTION).toEqual(createScheduledTaskBullOptions(connection).defaultJobOptions);
	});
});
