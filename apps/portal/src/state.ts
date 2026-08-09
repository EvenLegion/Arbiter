import type { ApiAuthIdentity, ApiIntegrationRegistryItem } from '@arbiter/api-contracts';

import { PortalApiError } from './api';

export function canEditIntegration(identity: ApiAuthIdentity, integration: ApiIntegrationRegistryItem): boolean {
	return integration.state === 'active' && (identity.role === 'EXEC' || integration.createdByUserId === identity.userId);
}

export function canArchiveIntegration(identity: ApiAuthIdentity, integration: ApiIntegrationRegistryItem): boolean {
	return integration.state === 'active' && identity.role === 'EXEC';
}

export function replaceIntegration(
	integrations: readonly ApiIntegrationRegistryItem[],
	replacement: ApiIntegrationRegistryItem,
	includeArchived: boolean
): ApiIntegrationRegistryItem[] {
	const next = integrations.filter((integration) => integration.id !== replacement.id);
	if (includeArchived || replacement.state === 'active') next.push(replacement);
	return next.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
}

export function describePortalError(error: unknown): string {
	if (!(error instanceof PortalApiError)) return 'Something unexpected happened. Try again.';
	const suffix = error.requestId ? ` Reference: ${error.requestId}` : '';
	switch (error.code) {
		case 'unauthorized':
			return `Your session has expired. Sign in again.${suffix}`;
		case 'forbidden':
			return `Your current staff role does not allow that action.${suffix}`;
		case 'conflict':
			return `That integration name is already in use.${suffix}`;
		case 'stale':
			return `This integration changed in another session. The registry has been refreshed.${suffix}`;
		case 'integration_archived':
			return `This integration has already been archived.${suffix}`;
		case 'service_unavailable':
		case 'network_error':
			return `The registry is temporarily unavailable. Try again shortly.${suffix}`;
		case 'bad_request':
			return `Check the integration details and try again.${suffix}`;
		default:
			return `The request could not be completed.${suffix}`;
	}
}
