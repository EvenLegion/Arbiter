import { Queue, QueueEvents, Worker, type Job } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createScheduledTaskBullOptions, type ScheduledTaskJobRetention } from '../../../src/config/scheduledTaskQueue';
import { applyRedisTestEnv, startRedisTestContainer, stopRedisTestContainer } from '../setup/testcontainers';

const TEST_RETENTION: ScheduledTaskJobRetention = {
	removeOnComplete: {
		age: 60 * 60,
		count: 2
	},
	removeOnFail: {
		age: 60 * 60,
		count: 2
	}
};

describe('scheduled task BullMQ retention integration', () => {
	let redisUrl: string;
	let redisContainer: Awaited<ReturnType<typeof startRedisTestContainer>>['redis'];

	beforeAll(async () => {
		const started = await startRedisTestContainer();
		redisContainer = started.redis;
		redisUrl = started.redisUrl;
		applyRedisTestEnv(redisUrl);
	});

	afterAll(async () => {
		if (redisContainer) {
			await stopRedisTestContainer(redisContainer);
		}
	});

	it('prunes finalized history while preserving active, delayed, retry, and repeatable work', async () => {
		const parsedRedisUrl = new URL(redisUrl);
		const connection = {
			host: parsedRedisUrl.hostname,
			port: Number(parsedRedisUrl.port),
			password: decodeURIComponent(parsedRedisUrl.password),
			db: 0,
			maxRetriesPerRequest: null
		};
		const queueName = `scheduled-tasks-retention-${Date.now()}`;
		const queueOptions = createScheduledTaskBullOptions(connection, TEST_RETENTION);
		const queue = new Queue(queueName, queueOptions);
		const queueEvents = new QueueEvents(queueName, { connection });
		let releaseActiveJob: (() => void) | undefined;
		const activeJobGate = new Promise<void>((resolve) => {
			releaseActiveJob = resolve;
		});
		const worker = new Worker(
			queueName,
			async (job) => {
				if (job.name === 'active') {
					await activeJobGate;
				}

				if (job.name === 'fail' || job.name === 'retry') {
					throw new Error(`expected ${job.name} failure`);
				}

				return job.name;
			},
			{
				connection,
				concurrency: 4
			}
		);

		try {
			await Promise.all([queue.waitUntilReady(), queueEvents.waitUntilReady(), worker.waitUntilReady()]);

			const activeJob = await queue.add('active', {});
			await waitForJobState(activeJob, 'active');

			const delayedJob = await queue.add('delayed', {}, { delay: 60_000 });
			const retryJob = await queue.add('retry', {}, { attempts: 2, backoff: { type: 'fixed', delay: 60_000 } });
			await waitForJobState(retryJob, 'delayed');

			const repeatableJob = await queue.add('repeatable', {}, { repeat: { every: 60_000 } });
			await waitForJobState(repeatableJob, 'delayed');

			for (let index = 0; index < 3; index += 1) {
				const completedJob = await queue.add('complete', { index });
				await completedJob.waitUntilFinished(queueEvents, 5_000);
			}

			for (let index = 0; index < 3; index += 1) {
				const failedJob = await queue.add('fail', { index });
				await expect(failedJob.waitUntilFinished(queueEvents, 5_000)).rejects.toThrow('expected fail failure');
			}

			expect(await queue.getJobCounts('completed', 'failed', 'active')).toMatchObject({
				completed: 2,
				failed: 2,
				active: 1
			});
			expect(await activeJob.getState()).toBe('active');
			expect(await delayedJob.getState()).toBe('delayed');
			const persistedRetryJob = await queue.getJob(retryJob.id!);
			expect(await persistedRetryJob?.getState()).toBe('delayed');
			expect(persistedRetryJob?.attemptsMade).toBe(1);
			expect(await repeatableJob.getState()).toBe('delayed');
			expect(await queue.getRepeatableJobs()).toHaveLength(1);
			expect(repeatableJob.opts.removeOnComplete).toEqual(TEST_RETENTION.removeOnComplete);
			expect(repeatableJob.opts.removeOnFail).toEqual(TEST_RETENTION.removeOnFail);
		} finally {
			releaseActiveJob?.();
			await worker.close();
			await queueEvents.close();
			await queue.obliterate({ force: true });
			await queue.close();
		}
	});
});

async function waitForJobState(job: Job, expectedState: string, timeoutMs = 5_000) {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		if ((await job.getState()) === expectedState) {
			return;
		}

		await new Promise((resolve) => setTimeout(resolve, 25));
	}

	throw new Error(`Job ${job.id ?? '<unknown>'} did not reach ${expectedState} within ${timeoutMs}ms`);
}
