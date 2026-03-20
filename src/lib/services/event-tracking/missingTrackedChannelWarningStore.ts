export class MissingTrackedChannelWarningStore {
	private readonly keys = new Set<string>();

	public noteMissingChannel({ eventSessionId, channelId }: { eventSessionId: number; channelId: string }) {
		const key = this.buildKey({
			eventSessionId,
			channelId
		});
		if (this.keys.has(key)) {
			return false;
		}

		this.keys.add(key);
		return true;
	}

	public clearChannel({ eventSessionId, channelId }: { eventSessionId: number; channelId: string }) {
		this.keys.delete(
			this.buildKey({
				eventSessionId,
				channelId
			})
		);
	}

	public clearSession({ eventSessionId }: { eventSessionId: number }) {
		for (const key of this.keys) {
			if (this.parseEventSessionId(key) === eventSessionId) {
				this.keys.delete(key);
			}
		}
	}

	public reconcileActiveSessionIds({ activeEventSessionIds }: { activeEventSessionIds: number[] }) {
		if (this.keys.size === 0) {
			return;
		}

		if (activeEventSessionIds.length === 0) {
			this.keys.clear();
			return;
		}

		const activeSessionIdSet = new Set(activeEventSessionIds);
		for (const key of this.keys) {
			const eventSessionId = this.parseEventSessionId(key);
			if (eventSessionId === null || !activeSessionIdSet.has(eventSessionId)) {
				this.keys.delete(key);
			}
		}
	}

	private buildKey({ eventSessionId, channelId }: { eventSessionId: number; channelId: string }) {
		return `${eventSessionId}:${channelId}`;
	}

	private parseEventSessionId(key: string) {
		const separatorIndex = key.indexOf(':');
		if (separatorIndex === -1) {
			return null;
		}

		const rawEventSessionId = key.slice(0, separatorIndex);
		const eventSessionId = Number.parseInt(rawEventSessionId, 10);
		return Number.isInteger(eventSessionId) ? eventSessionId : null;
	}
}
