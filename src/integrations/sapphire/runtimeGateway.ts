import { container } from '@sapphire/framework';

export function getRuntimeClient() {
	return container.client;
}

export function getRuntimeLogger() {
	return container.logger;
}

export function isRuntimeClientReady() {
	return container.client.isReady();
}

export async function refreshRuntimeDivisionCache() {
	await container.utilities.divisionCache.refresh();
}
