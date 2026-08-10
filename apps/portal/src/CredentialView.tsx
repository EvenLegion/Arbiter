import type { ApiAuthIdentity, ApiCredentialMetadata, ApiIntegrationRegistryItem, MintApiCredentialRequest } from '@arbiter/api-contracts';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { canRevokeCredential, type OneTimeSecretState } from './state';

export function CredentialView({
	identity,
	integration,
	credentials,
	oneTimeSecret,
	busy,
	feedback,
	onBack,
	onRefresh,
	onMint,
	onRevoke,
	onDismissSecret
}: {
	identity: ApiAuthIdentity;
	integration: ApiIntegrationRegistryItem;
	credentials: ApiCredentialMetadata[];
	oneTimeSecret: OneTimeSecretState;
	busy: boolean;
	feedback: string | null;
	onBack: () => void;
	onRefresh: () => void;
	onMint: (input: MintApiCredentialRequest) => Promise<boolean>;
	onRevoke: (credential: ApiCredentialMetadata) => Promise<boolean>;
	onDismissSecret: () => void;
}) {
	const [dialog, setDialog] = useState<'mint' | ApiCredentialMetadata | null>(null);

	return (
		<>
			<section className="page-intro credential-intro" aria-labelledby="credential-title">
				<div>
					<button className="back-link" type="button" disabled={busy} onClick={onBack}>
						← Integration registry
					</button>
					<p className="eyebrow">Integration credentials</p>
					<h1 id="credential-title">{integration.name}</h1>
					<p className="intro-copy">{integration.purpose}</p>
				</div>
				{integration.state === 'active' && (
					<button className="button primary" type="button" disabled={busy} onClick={() => setDialog('mint')}>
						Mint credential
					</button>
				)}
			</section>

			<div className="credential-toolbar">
				<p>
					<span>Status</span> {integration.state}
				</p>
				<p>
					<span>Credentials</span> {credentials.length}
				</p>
				<button className="toolbar-action" type="button" disabled={busy} onClick={onRefresh}>
					Refresh credentials
				</button>
			</div>

			<div className="status-line" role="status" aria-live="polite">
				{feedback ?? `${credentials.length} credential${credentials.length === 1 ? '' : 's'} for this integration`}
			</div>

			{oneTimeSecret && <OneTimeSecretPanel value={oneTimeSecret} onDismiss={onDismissSecret} />}

			<CredentialList identity={identity} credentials={credentials} busy={busy} onRevoke={(credential) => setDialog(credential)} />

			<footer className="access-notes">
				<p>Only users:read is available. Mint a replacement before revoking an existing credential to rotate without a planned gap.</p>
				<p>Existing secrets cannot be recovered or displayed again. Registered integrations are not endorsements.</p>
			</footer>

			{dialog === 'mint' && (
				<MintCredentialDialog
					busy={busy}
					feedback={feedback}
					onClose={() => setDialog(null)}
					onSubmit={async (input) => {
						if (await onMint(input)) setDialog(null);
					}}
				/>
			)}
			{dialog && dialog !== 'mint' && (
				<RevokeCredentialDialog
					credential={dialog}
					busy={busy}
					feedback={feedback}
					onClose={() => setDialog(null)}
					onConfirm={async () => {
						if (await onRevoke(dialog)) setDialog(null);
					}}
				/>
			)}
		</>
	);
}

function OneTimeSecretPanel({ value, onDismiss }: { value: NonNullable<OneTimeSecretState>; onDismiss: () => void }) {
	const [copyStatus, setCopyStatus] = useState('');
	const headingRef = useRef<HTMLHeadingElement>(null);

	useEffect(() => {
		headingRef.current?.focus();
	}, []);

	async function copySecret() {
		try {
			await navigator.clipboard.writeText(value.secret);
			setCopyStatus('Copied. Store it in the destination secret manager now.');
		} catch {
			setCopyStatus('Copy was unavailable. Select the value and copy it manually.');
		}
	}

	return (
		<section className="secret-panel" aria-labelledby="one-time-secret-title">
			<div className="secret-heading">
				<div>
					<p className="eyebrow">One-time secret</p>
					<h2 id="one-time-secret-title" ref={headingRef} tabIndex={-1}>
						Store this credential now
					</h2>
				</div>
				<button className="icon-button" type="button" aria-label="Dismiss one-time secret" onClick={onDismiss}>
					×
				</button>
			</div>
			<p>
				This is the only time Arbiter will display the secret. It disappears when you refresh, navigate away, or dismiss this panel and cannot
				be recovered.
			</p>
			<code className="secret-value">{value.secret}</code>
			<div className="secret-actions">
				<button className="button primary" type="button" onClick={() => void copySecret()}>
					Copy secret
				</button>
				<span role="status" aria-live="polite">
					{copyStatus}
				</span>
			</div>
		</section>
	);
}

function CredentialList({
	identity,
	credentials,
	busy,
	onRevoke
}: {
	identity: ApiAuthIdentity;
	credentials: ApiCredentialMetadata[];
	busy: boolean;
	onRevoke: (credential: ApiCredentialMetadata) => void;
}) {
	if (credentials.length === 0) {
		return (
			<section className="empty-state">
				<h2>No credentials yet</h2>
				<p>Mint the first credential when this integration is ready to call Arbiter.</p>
			</section>
		);
	}

	return (
		<section className="credential-records" aria-label="Integration credentials">
			{credentials.map((credential) => (
				<article className="credential-record" key={credential.id}>
					<div className="credential-record-title">
						<h2>{credential.label}</h2>
						<span className={`credential-status ${credential.status}`}>{credential.status.replace('_', ' ')}</span>
					</div>
					<dl className="credential-meta">
						<div>
							<dt>Prefix</dt>
							<dd>
								<code>arb_v1_{credential.prefix}_…</code>
							</dd>
						</div>
						<div>
							<dt>Creator</dt>
							<dd>{credential.creator.discordNickname}</dd>
						</div>
						<div>
							<dt>Scopes</dt>
							<dd>{credential.scopes.join(', ')}</dd>
						</div>
						<div>
							<dt>Created</dt>
							<dd>
								<time dateTime={credential.createdAt}>{formatDate(credential.createdAt)}</time>
							</dd>
						</div>
						<div>
							<dt>Expires</dt>
							<dd>
								<time dateTime={credential.expiresAt}>{formatDate(credential.expiresAt)}</time>
							</dd>
						</div>
						<div>
							<dt>Last used</dt>
							<dd>
								{credential.lastUsedAt ? <time dateTime={credential.lastUsedAt}>{formatDate(credential.lastUsedAt)}</time> : 'Never'}
							</dd>
						</div>
						<div>
							<dt>Revoked</dt>
							<dd>{credential.revokedAt ? <time dateTime={credential.revokedAt}>{formatDate(credential.revokedAt)}</time> : '—'}</dd>
						</div>
					</dl>
					{canRevokeCredential(identity, credential) && (
						<button className="record-action danger" type="button" disabled={busy} onClick={() => onRevoke(credential)}>
							Revoke
						</button>
					)}
				</article>
			))}
		</section>
	);
}

function MintCredentialDialog({
	busy,
	feedback,
	onClose,
	onSubmit
}: {
	busy: boolean;
	feedback: string | null;
	onClose: () => void;
	onSubmit: (input: MintApiCredentialRequest) => Promise<void>;
}) {
	const [label, setLabel] = useState('');
	const [expiryDate, setExpiryDate] = useState('');
	const dialogRef = useDialog(onClose);

	function submit(event: FormEvent) {
		event.preventDefault();
		void onSubmit({
			label: label.trim(),
			scopes: ['users:read'],
			...(expiryDate ? { expiresAt: new Date(`${expiryDate}T00:00:00.000Z`).toISOString() } : {})
		});
	}

	return (
		<dialog
			ref={dialogRef}
			className="modal"
			aria-labelledby="mint-title"
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
						<p className="eyebrow">Credential issuance</p>
						<h2 id="mint-title">Mint a credential</h2>
					</div>
					<button className="icon-button" type="button" aria-label="Close dialog" disabled={busy} onClick={onClose}>
						×
					</button>
				</div>
				<p className="dialog-description">
					Arbiter will show the new secret once. Mint a new credential before revoking an old one when rotating access.
				</p>
				<label className="field">
					<span>Label</span>
					<input autoFocus required maxLength={100} value={label} onChange={(event) => setLabel(event.currentTarget.value)} />
					<small>{label.length}/100 — describe the credential's owner or deployment</small>
				</label>
				<label className="field">
					<span>Expiry date</span>
					<input
						type="date"
						min={tomorrowDate()}
						max={oneYearDate()}
						value={expiryDate}
						onChange={(event) => setExpiryDate(event.currentTarget.value)}
					/>
					<small>Optional. Leave blank for the API default of one year; shorter expiries are allowed.</small>
				</label>
				<fieldset className="scope-field">
					<legend>Scope</legend>
					<label>
						<input type="checkbox" checked readOnly /> users:read
					</label>
					<small>No other credential permissions are available.</small>
				</fieldset>
				{feedback && (
					<p className="dialog-feedback" role="alert">
						{feedback}
					</p>
				)}
				<div className="modal-actions">
					<button className="button ghost" type="button" disabled={busy} onClick={onClose}>
						Cancel
					</button>
					<button className="button primary" type="submit" disabled={busy || label.trim().length === 0}>
						{busy ? 'Minting…' : 'Mint and show once'}
					</button>
				</div>
			</form>
		</dialog>
	);
}

function RevokeCredentialDialog({
	credential,
	busy,
	feedback,
	onClose,
	onConfirm
}: {
	credential: ApiCredentialMetadata;
	busy: boolean;
	feedback: string | null;
	onClose: () => void;
	onConfirm: () => Promise<void>;
}) {
	const dialogRef = useDialog(onClose);
	return (
		<dialog
			ref={dialogRef}
			className="modal danger-modal"
			aria-labelledby="revoke-title"
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
			<h2 id="revoke-title">Revoke {credential.label}?</h2>
			<p>
				The credential with prefix <code>arb_v1_{credential.prefix}_…</code> will stop authenticating immediately. Revocation cannot be
				undone, and its original secret cannot be recovered.
			</p>
			{feedback && (
				<p className="dialog-feedback" role="alert">
					{feedback}
				</p>
			)}
			<div className="modal-actions">
				<button className="button ghost" type="button" autoFocus disabled={busy} onClick={onClose}>
					Keep credential
				</button>
				<button className="button danger" type="button" disabled={busy} onClick={() => void onConfirm()}>
					{busy ? 'Revoking…' : 'Revoke credential'}
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

function tomorrowDate(): string {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10);
}

function oneYearDate(): string {
	const date = new Date();
	date.setUTCFullYear(date.getUTCFullYear() + 1);
	return date.toISOString().slice(0, 10);
}

function formatDate(value: string): string {
	return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
