import type { ApiAuthIdentity, ApiCredentialMetadata, ApiIntegrationRegistryItem } from '@arbiter/api-contracts';

import { PortalApiError } from './api';

export function canEditIntegration(identity: ApiAuthIdentity, integration: ApiIntegrationRegistryItem): boolean {
	return integration.state === 'active' && (identity.role === 'EXEC' || integration.createdByUserId === identity.userId);
}

export function canArchiveIntegration(identity: ApiAuthIdentity, integration: ApiIntegrationRegistryItem): boolean {
	return integration.state === 'active' && identity.role === 'EXEC';
}

export function canRevokeCredential(identity: ApiAuthIdentity, credential: ApiCredentialMetadata): boolean {
	return credential.revokedAt === null && (identity.role === 'EXEC' || credential.createdByUserId === identity.userId);
}

export function replaceCredential(credentials: readonly ApiCredentialMetadata[], replacement: ApiCredentialMetadata): ApiCredentialMetadata[] {
	return [...credentials.filter((credential) => credential.id !== replacement.id), replacement].sort(
		(left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)
	);
}

export type PortalRoute = { kind: 'registry' } | { kind: 'credentials'; integrationId: string };

const UUID_PATH_PATTERN = /^\/integrations\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i;

export function parsePortalRoute(pathname: string): PortalRoute {
	const match = UUID_PATH_PATTERN.exec(pathname);
	return match ? { kind: 'credentials', integrationId: match[1] } : { kind: 'registry' };
}

export function credentialDetailPath(integrationId: string): string {
	return `/integrations/${encodeURIComponent(integrationId)}`;
}

export type OneTimeSecretState = { credential: ApiCredentialMetadata; secret: string } | null;

export function transitionOneTimeSecret(
	current: OneTimeSecretState,
	event: { type: 'reveal'; value: NonNullable<OneTimeSecretState> } | { type: 'dismiss' | 'navigate' | 'refresh' }
): OneTimeSecretState {
	return event.type === 'reveal' ? event.value : null;
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

export function describePortalError(error: unknown, operation: 'integration' | 'credential' = 'integration'): string {
	if (!(error instanceof PortalApiError)) return 'Something unexpected happened. Try again.';
	const suffix = error.requestId ? ` Reference: ${error.requestId}` : '';
	switch (error.code) {
		case 'unauthorized':
			return `Your session has expired. Sign in again.${suffix}`;
		case 'forbidden':
			return `Your current staff role does not allow that action.${suffix}`;
		case 'conflict':
			return operation === 'credential'
				? `Arbiter could not mint a unique credential. Try again.${suffix}`
				: `That integration name is already in use.${suffix}`;
		case 'stale':
			return `This integration changed in another session. The registry has been refreshed.${suffix}`;
		case 'integration_archived':
			return `This integration has already been archived.${suffix}`;
		case 'service_unavailable':
		case 'network_error':
			return `The portal data is temporarily unavailable. Try again shortly.${suffix}`;
		case 'bad_request':
			return `Check the submitted details and try again.${suffix}`;
		default:
			return `The request could not be completed.${suffix}`;
	}
}

export function isPortalError(error: unknown, ...codes: PortalApiError['code'][]): error is PortalApiError {
	return error instanceof PortalApiError && codes.includes(error.code);
}
