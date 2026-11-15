import { describe, expect, it } from 'vitest';

import { createKeyedLock } from '../../../../../src/lib/services/merit-badge/meritBadgeMemberLock';

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('createKeyedLock', () => {
	it('runs tasks for one key in order and other keys in parallel', async () => {
		const runExclusive = createKeyedLock();
		const events: string[] = [];
		const gate = deferred();

		const first = runExclusive('a', async () => {
			events.push('a1 start');
			await gate.promise;
			events.push('a1 end');
		});
		const second = runExclusive('a', async () => {
			events.push('a2');
		});
		const other = runExclusive('b', async () => {
			events.push('b');
		});

		await other;
		expect(events).toEqual(['a1 start', 'b']);

		gate.resolve();
		await Promise.all([first, second]);
		expect(events).toEqual(['a1 start', 'b', 'a1 end', 'a2']);
	});

	it('releases the lock when a task fails', async () => {
		const runExclusive = createKeyedLock();

		await expect(runExclusive('a', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
		await expect(runExclusive('a', async () => 'next')).resolves.toBe('next');
	});
});
