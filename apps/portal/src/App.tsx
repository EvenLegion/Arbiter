import type { ApiAuthIdentity, ApiIntegrationRegistryItem } from '@arbiter/api-contracts';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { PortalApiError, type PortalApi, type PortalSession } from './api';
import { canArchiveIntegration, canEditIntegration, describePortalError, replaceIntegration } from './state';

type ReadyState = PortalSession & {
	integrations: ApiIntegrationRegistryItem[];
};

type DialogState =
	| { kind: 'create' }
	| { kind: 'edit'; integration: ApiIntegrationRegistryItem }
	| { kind: 'archive'; integration: ApiIntegrationRegistryItem }
	| null;

export function App({ api }: { api: PortalApi }) {
	const [status, setStatus] = useState<'loading' | 'signed-out' | 'ready' | 'error'>('loading');
	const [ready, setReady] = useState<ReadyState | null>(null);
	const [includeArchived, setIncludeArchived] = useState(false);
	const [dialog, setDialog] = useState<DialogState>(null);
	const [feedback, setFeedback] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [fatalMessage, setFatalMessage] = useState('The staff portal could not be loaded.');

	const loadRegistry = useCallback(
		async (showArchived: boolean) => {
			const integrations = await api.listIntegrations(showArchived);
			setReady((current) => (current ? { ...current, integrations } : current));
		},
		[api]
	);

	useEffect(() => {
		let active = true;
		void (async () => {
			try {
				const session = await api.recoverSession();
				const integrations = await api.listIntegrations(false);
				if (!active) return;
				if (window.location.pathname === '/auth/callback') window.history.replaceState({}, '', '/');
				setReady({ ...session, integrations });
				setStatus('ready');
			} catch (error) {
				if (!active) return;
				if (error instanceof PortalApiError && error.code === 'unauthorized') {
					setStatus('signed-out');
					return;
				}
				setFatalMessage(describePortalError(error));
				setStatus('error');
			}
		})();
		return () => {
			active = false;
		};
	}, [api]);

	async function signIn() {
		setBusy(true);
		setFeedback(null);
		try {
			const authorizationUrl = await api.startSignIn(`${window.location.origin}/auth/callback`);
			window.location.assign(authorizationUrl);
		} catch (error) {
			setFeedback(describePortalError(error));
			setBusy(false);
		}
	}

	async function logout() {
		if (!ready) return;
		setBusy(true);
		try {
			await api.logout(ready.csrfToken);
			setReady(null);
			setStatus('signed-out');
			setFeedback('Signed out securely.');
		} catch (error) {
			setFeedback(describePortalError(error));
		} finally {
			setBusy(false);
		}
	}

	async function toggleArchived(next: boolean) {
		setIncludeArchived(next);
		setBusy(true);
		try {
			await loadRegistry(next);
		} catch (error) {
			setFeedback(describePortalError(error));
		} finally {
			setBusy(false);
		}
	}

	async function createIntegration(input: { name: string; purpose: string }) {
		if (!ready) return;
		await runMutation(async () => {
			const created = await api.createIntegration(ready.csrfToken, input);
			setReady((current) =>
				current ? { ...current, integrations: replaceIntegration(current.integrations, created, includeArchived) } : current
			);
			setFeedback(`${created.name} is now registered.`);
		});
	}

	async function editIntegration(integration: ApiIntegrationRegistryItem, input: { name: string; purpose: string }) {
		if (!ready) return;
		await runMutation(async () => {
			const updated = await api.editIntegration(ready.csrfToken, integration.id, {
				...input,
				expectedUpdatedAt: integration.updatedAt
			});
			setReady((current) =>
				current ? { ...current, integrations: replaceIntegration(current.integrations, updated, includeArchived) } : current
			);
			setFeedback(`${updated.name} was updated.`);
		});
	}

	async function archiveIntegration(integration: ApiIntegrationRegistryItem) {
		if (!ready) return;
		await runMutation(async () => {
			const archived = await api.archiveIntegration(ready.csrfToken, integration.id, integration.updatedAt);
			setReady((current) =>
				current ? { ...current, integrations: replaceIntegration(current.integrations, archived, includeArchived) } : current
			);
			setFeedback(`${archived.name} was archived and its credentials were invalidated.`);
		});
	}

	async function runMutation(operation: () => Promise<void>) {
		setBusy(true);
		setFeedback(null);
		try {
			await operation();
			setDialog(null);
		} catch (error) {
			setFeedback(describePortalError(error));
			if (error instanceof PortalApiError && (error.code === 'stale' || error.code === 'integration_archived')) {
				await loadRegistry(includeArchived).catch(() => undefined);
				setDialog(null);
			}
			if (error instanceof PortalApiError && error.code === 'unauthorized') {
				setReady(null);
				setStatus('signed-out');
				setDialog(null);
			}
		} finally {
			setBusy(false);
		}
	}

	if (status === 'loading') return <LoadingScreen />;
	if (status === 'signed-out') return <SignedOutScreen busy={busy} feedback={feedback} onSignIn={() => void signIn()} />;
	if (status === 'error' || !ready) return <ErrorScreen message={fatalMessage} />;

	return (
		<div className="app-shell">
			<PortalSidebar
				identity={ready.identity}
				integrations={ready.integrations}
				includeArchived={includeArchived}
				busy={busy}
				onToggleArchived={(next) => void toggleArchived(next)}
				onLogout={() => void logout()}
			/>
			<main id="main-content">
				<div className="context-strip" aria-label="Portal context">
					<span className="context-year">{new Date().getFullYear()}</span>
					<span className="context-item active">Registry</span>
					<span className="context-item">Staff access</span>
					<span className="context-item">API owned</span>
				</div>
				<section className="hero" aria-labelledby="registry-title">
					<div>
						<p className="eyebrow">Shared_access_layer</p>
						<h1 id="registry-title">Integration registry</h1>
						<p className="hero-copy">
							Register the systems that connect to Arbiter. Credentials stay API-owned and are managed separately.
						</p>
					</div>
					<div className="hero-actions">
						<button className="button primary" type="button" disabled={busy} onClick={() => setDialog({ kind: 'create' })}>
							Register integration <span aria-hidden="true">»</span>
						</button>
					</div>
				</section>

				<div className="status-line" role="status" aria-live="polite">
					{feedback ?? `${ready.integrations.length} integration${ready.integrations.length === 1 ? '' : 's'} in this view`}
				</div>

				<RegistryGrid
					identity={ready.identity}
					integrations={ready.integrations}
					onEdit={(integration) => setDialog({ kind: 'edit', integration })}
					onArchive={(integration) => setDialog({ kind: 'archive', integration })}
				/>
			</main>

			{dialog?.kind === 'create' && (
				<IntegrationFormDialog
					title="Register an integration"
					description="Give staff enough context to understand why this integration exists. Names are unique after trimming, spacing, and case normalization."
					submitLabel="Register integration"
					busy={busy}
					onClose={() => setDialog(null)}
					onSubmit={createIntegration}
				/>
			)}
			{dialog?.kind === 'edit' && (
				<IntegrationFormDialog
					title={`Edit ${dialog.integration.name}`}
					description="Changes are checked against the latest registry version before they are saved."
					submitLabel="Save changes"
					initialName={dialog.integration.name}
					initialPurpose={dialog.integration.purpose}
					busy={busy}
					onClose={() => setDialog(null)}
					onSubmit={(input) => editIntegration(dialog.integration, input)}
				/>
			)}
			{dialog?.kind === 'archive' && (
				<ArchiveDialog
					integration={dialog.integration}
					busy={busy}
					onClose={() => setDialog(null)}
					onConfirm={() => archiveIntegration(dialog.integration)}
				/>
			)}
		</div>
	);
}

function PortalSidebar({
	identity,
	integrations,
	includeArchived,
	busy,
	onToggleArchived,
	onLogout
}: {
	identity: ApiAuthIdentity;
	integrations: ApiIntegrationRegistryItem[];
	includeArchived: boolean;
	busy: boolean;
	onToggleArchived: (next: boolean) => void;
	onLogout: () => void;
}) {
	const activeCount = integrations.filter((integration) => integration.state === 'active').length;
	const archivedCount = integrations.filter((integration) => integration.state === 'archived').length;

	return (
		<aside className="sidebar" aria-label="Registry controls">
			<div className="brand-lockup">
				<strong>
					<span aria-hidden="true">&gt;</span> ARBITER.REGISTRY
				</strong>
				<span>v1.0</span>
			</div>
			<div className="filter-heading">
				<span>Registry_filters</span>
				<span>[{integrations.length.toString().padStart(2, '0')}]</span>
			</div>
			<nav className="filter-list" aria-label="Integration filters">
				<div className="filter-row static">
					<span>
						<span aria-hidden="true">&gt; [×]</span> Active
					</span>
					<span>[{activeCount.toString().padStart(2, '0')}]</span>
				</div>
				<label className="filter-row">
					<input
						type="checkbox"
						checked={includeArchived}
						disabled={busy}
						onChange={(event) => onToggleArchived(event.currentTarget.checked)}
					/>
					<span>
						<span aria-hidden="true">&gt; [{includeArchived ? '×' : ' '}]</span> Archived
					</span>
					<span>[{includeArchived ? archivedCount.toString().padStart(2, '0') : '--'}]</span>
				</label>
			</nav>
			<div className="identity-block">
				<div className="identity-line">
					<img src={identity.discordAvatarUrl} alt="" />
					<div>
						<strong>{identity.discordNickname}</strong>
						<span>{identity.role} / authenticated</span>
					</div>
				</div>
				<button className="sidebar-action" type="button" disabled={busy} onClick={onLogout}>
					&gt; Sign out
				</button>
			</div>
		</aside>
	);
}

function RegistryGrid({
	identity,
	integrations,
	onEdit,
	onArchive
}: {
	identity: ApiAuthIdentity;
	integrations: ApiIntegrationRegistryItem[];
	onEdit: (integration: ApiIntegrationRegistryItem) => void;
	onArchive: (integration: ApiIntegrationRegistryItem) => void;
}) {
	if (integrations.length === 0) {
		return (
			<section className="empty-state">
				<div className="empty-orbit" aria-hidden="true" />
				<h2>No integrations in this view</h2>
				<p>Register the first integration, or include archived records to inspect earlier entries.</p>
			</section>
		);
	}

	const active = integrations.filter((integration) => integration.state === 'active');
	const archived = integrations.filter((integration) => integration.state === 'archived');

	return (
		<section className="registry-feed" aria-label="Registered integrations">
			{active.length > 0 && (
				<RegistryGroup label="Active_registry" integrations={active} identity={identity} onEdit={onEdit} onArchive={onArchive} />
			)}
			{archived.length > 0 && (
				<RegistryGroup label="Archived_registry" integrations={archived} identity={identity} onEdit={onEdit} onArchive={onArchive} />
			)}
		</section>
	);
}

function RegistryGroup({
	label,
	integrations,
	identity,
	onEdit,
	onArchive
}: {
	label: string;
	integrations: ApiIntegrationRegistryItem[];
	identity: ApiAuthIdentity;
	onEdit: (integration: ApiIntegrationRegistryItem) => void;
	onArchive: (integration: ApiIntegrationRegistryItem) => void;
}) {
	return (
		<section className="registry-group" aria-labelledby={`${label}-title`}>
			<h2 className="group-heading" id={`${label}-title`}>
				{label} <span>[{integrations.length.toString().padStart(2, '0')}]</span>
			</h2>
			{integrations.map((integration) => (
				<article className={`integration-card ${integration.state}`} key={integration.id}>
					<div className="card-topline">
						<span className={`state-pill ${integration.state}`}>
							<span aria-hidden="true" /> {integration.state}
						</span>
						<span className="credential-count">
							{integration.credentialCount} credential{integration.credentialCount === 1 ? '' : 's'} /{' '}
							{integration.creator.discordNickname}
						</span>
						<time dateTime={integration.updatedAt}>{formatDate(integration.updatedAt)}</time>
					</div>
					<div className="card-content">
						<div>
							<h3>{integration.name}</h3>
							<p className="purpose">{integration.purpose}</p>
							<p className="record-meta">Registered / {formatDate(integration.createdAt)}</p>
						</div>
						<div className="card-actions">
							{canEditIntegration(identity, integration) && (
								<button className="record-action" type="button" onClick={() => onEdit(integration)}>
									Edit metadata »
								</button>
							)}
							{canArchiveIntegration(identity, integration) && (
								<button className="record-action danger" type="button" onClick={() => onArchive(integration)}>
									Archive »
								</button>
							)}
							{!canEditIntegration(identity, integration) && !canArchiveIntegration(identity, integration) && (
								<span className="read-only-note">View_only</span>
							)}
						</div>
					</div>
				</article>
			))}
		</section>
	);
}

function IntegrationFormDialog({
	title,
	description,
	submitLabel,
	initialName = '',
	initialPurpose = '',
	busy,
	onClose,
	onSubmit
}: {
	title: string;
	description: string;
	submitLabel: string;
	initialName?: string;
	initialPurpose?: string;
	busy: boolean;
	onClose: () => void;
	onSubmit: (input: { name: string; purpose: string }) => Promise<void>;
}) {
	const [name, setName] = useState(initialName);
	const [purpose, setPurpose] = useState(initialPurpose);
	const dialogRef = useDialog(onClose);

	function submit(event: FormEvent) {
		event.preventDefault();
		void onSubmit({ name, purpose });
	}

	return (
		<dialog
			ref={dialogRef}
			className="modal"
			aria-labelledby="dialog-title"
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					event.preventDefault();
					onClose();
				}
			}}
		>
			<form onSubmit={submit}>
				<div className="modal-heading">
					<div>
						<p className="eyebrow">Registry metadata</p>
						<h2 id="dialog-title">{title}</h2>
					</div>
					<button className="icon-button" type="button" aria-label="Close dialog" disabled={busy} onClick={onClose}>
						×
					</button>
				</div>
				<p className="dialog-description">{description}</p>
				<label className="field">
					<span>Integration name</span>
					<input autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.currentTarget.value)} />
					<small>{name.length}/100</small>
				</label>
				<label className="field">
					<span>Purpose</span>
					<textarea required maxLength={500} rows={5} value={purpose} onChange={(event) => setPurpose(event.currentTarget.value)} />
					<small>{purpose.length}/500</small>
				</label>
				<div className="modal-actions">
					<button className="button ghost" type="button" disabled={busy} onClick={onClose}>
						Cancel
					</button>
					<button className="button primary" type="submit" disabled={busy || name.trim().length === 0 || purpose.trim().length === 0}>
						{busy ? 'Saving…' : submitLabel}
					</button>
				</div>
			</form>
		</dialog>
	);
}

function ArchiveDialog({
	integration,
	busy,
	onClose,
	onConfirm
}: {
	integration: ApiIntegrationRegistryItem;
	busy: boolean;
	onClose: () => void;
	onConfirm: () => Promise<void>;
}) {
	const dialogRef = useDialog(onClose);
	return (
		<dialog
			ref={dialogRef}
			className="modal danger-modal"
			aria-labelledby="archive-title"
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					event.preventDefault();
					onClose();
				}
			}}
		>
			<div className="warning-mark" aria-hidden="true">
				!
			</div>
			<h2 id="archive-title">Archive {integration.name}?</h2>
			<p>
				Archiving this integration immediately invalidates all {integration.credentialCount} associated credentials. Existing clients will
				lose access, and the integration cannot be restored from this portal.
			</p>
			<div className="modal-actions">
				<button className="button ghost" type="button" autoFocus disabled={busy} onClick={onClose}>
					Keep active
				</button>
				<button className="button danger" type="button" disabled={busy} onClick={() => void onConfirm()}>
					{busy ? 'Archiving…' : 'Archive and invalidate'}
				</button>
			</div>
		</dialog>
	);
}

function useDialog(onClose: () => void) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		dialog.showModal();
		(dialog.querySelector<HTMLElement>('input') ?? dialog.querySelector<HTMLElement>('button'))?.focus();
		return () => dialog.close();
	}, []);
	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		const cancel = (event: Event) => {
			event.preventDefault();
			onClose();
		};
		dialog.addEventListener('cancel', cancel);
		return () => dialog.removeEventListener('cancel', cancel);
	}, [onClose]);
	return dialogRef;
}

function LoadingScreen() {
	return (
		<FullScreenPanel>
			<div className="loader" aria-hidden="true" />
			<p className="eyebrow">Secure session</p>
			<h1>Recovering staff access</h1>
			<p>Arbiter is checking your API-owned session and current staff membership.</p>
		</FullScreenPanel>
	);
}

function SignedOutScreen({ busy, feedback, onSignIn }: { busy: boolean; feedback: string | null; onSignIn: () => void }) {
	return (
		<FullScreenPanel>
			<div className="brand-mark large" aria-hidden="true">
				A
			</div>
			<p className="eyebrow">Even Legion operations</p>
			<h1>Staff access, deliberately bounded.</h1>
			<p>Sign in with Discord. Arbiter’s API verifies your current staff membership before showing the shared registry.</p>
			<button className="button primary wide" type="button" disabled={busy} onClick={onSignIn}>
				{busy ? 'Connecting…' : 'Continue with Discord'}
			</button>
			<div className="status-line centered" role="status" aria-live="polite">
				{feedback}
			</div>
		</FullScreenPanel>
	);
}

function ErrorScreen({ message }: { message: string }) {
	return (
		<FullScreenPanel>
			<div className="warning-mark" aria-hidden="true">
				!
			</div>
			<p className="eyebrow">Portal unavailable</p>
			<h1>Access could not be confirmed</h1>
			<p>{message}</p>
			<button className="button primary wide" type="button" onClick={() => window.location.reload()}>
				Try again
			</button>
		</FullScreenPanel>
	);
}

export function ConfigurationError({ message }: { message: string }) {
	return (
		<FullScreenPanel>
			<div className="warning-mark" aria-hidden="true">
				!
			</div>
			<p className="eyebrow">Configuration required</p>
			<h1>The portal needs its public API origin</h1>
			<p>{message}</p>
		</FullScreenPanel>
	);
}

function FullScreenPanel({ children }: { children: ReactNode }) {
	return (
		<main className="fullscreen">
			<section className="fullscreen-panel">{children}</section>
		</main>
	);
}

function formatDate(value: string): string {
	return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
