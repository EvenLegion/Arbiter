export type ScheduledTaskJobRetention = {
	removeOnComplete: {
		age: number;
		count: number;
	};
	removeOnFail: {
		age: number;
		count: number;
	};
};

export type ScheduledTaskRedisConnection = {
	host: string;
	port: number;
	password?: string;
	db: number;
	maxRetriesPerRequest?: number | null;
};

export const SCHEDULED_TASK_JOB_RETENTION: ScheduledTaskJobRetention = {
	removeOnComplete: {
		age: 24 * 60 * 60,
		count: 5_000
	},
	removeOnFail: {
		age: 7 * 24 * 60 * 60,
		count: 1_000
	}
};

export function createScheduledTaskBullOptions(
	connection: ScheduledTaskRedisConnection,
	defaultJobOptions: ScheduledTaskJobRetention = SCHEDULED_TASK_JOB_RETENTION
) {
	return {
		connection,
		defaultJobOptions
	};
}
