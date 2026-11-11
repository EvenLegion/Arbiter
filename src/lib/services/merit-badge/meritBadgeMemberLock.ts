export type RunExclusive = <T>(key: string, task: () => Promise<T>) => Promise<T>;

/**
 * In-process lock keyed by member: tasks for the same key run one at a time, in call order.
 * Tasks for different keys run in parallel. A failed task releases the lock for the next one.
 *
 * Arbiter runs one bot process, so this is enough to stop two badge syncs for the same member
 * from interleaving their role calls. It does not coordinate across processes.
 */
export function createKeyedLock(): RunExclusive {
	const tails = new Map<string, Promise<void>>();

	return async function runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
		const previous = tails.get(key) ?? Promise.resolve();
		let release!: () => void;
		const current = new Promise<void>((resolve) => {
			release = resolve;
		});
		const tail = previous.then(() => current);
		tails.set(key, tail);

		await previous;
		try {
			return await task();
		} finally {
			release();
			if (tails.get(key) === tail) {
				tails.delete(key);
			}
		}
	};
}

/** The one lock every badge sync path shares (listener hooks, award hooks and the bulk command). */
export const MERIT_BADGE_MEMBER_LOCK: RunExclusive = createKeyedLock();
