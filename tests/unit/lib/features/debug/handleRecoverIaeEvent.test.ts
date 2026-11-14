import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), actor: vi.fn(), responder: vi.fn(), run: vi.fn(), deps: vi.fn() }));
vi.mock('../../../../../src/config/env', () => ({ ENV_DISCORD: { DISCORD_GUILD_ID: 'configured' } }));
vi.mock('../../../../../src/lib/discord/interactions/prepareGuildInteraction', () => ({ prepareGuildInteraction: mocks.prepare }));
vi.mock('../../../../../src/lib/discord/interactions/interactionPreflight', () => ({ resolveInteractionActor: mocks.actor }));
vi.mock('../../../../../src/lib/discord/interactions/interactionResponder', () => ({ createInteractionResponder: mocks.responder }));
vi.mock('../../../../../src/lib/services/event-recovery/iaeEventRecovery', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../../../src/lib/services/event-recovery/iaeEventRecovery')>()),
	runIaeEventRecovery: mocks.run
}));
vi.mock('../../../../../src/lib/features/debug/createIaeEventRecoveryDeps', () => ({ createIaeEventRecoveryDeps: mocks.deps }));
import { handleRecoverIaeEvent } from '../../../../../src/lib/features/debug/handleRecoverIaeEvent';

describe('temporary IAE recovery handler', () => {
	const actor = { discordUserId: 'staff', dbUserId: 'db-staff', capabilities: { isStaff: true, isCenturion: false, isOptio: false } };
	let prepared: {
		guild: { id: string };
		logger: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
		responder: { deferEphemeralReply: ReturnType<typeof vi.fn>; fail: ReturnType<typeof vi.fn>; safeEditReply: ReturnType<typeof vi.fn> };
	};
	let interaction: { guildId: string | null; user: { id: string }; options: { getBoolean: ReturnType<typeof vi.fn> } };
	const invoke = () =>
		handleRecoverIaeEvent({ interaction: interaction as never, context: { requestId: 'request-1', logger: prepared.logger } as never });
	beforeEach(() => {
		for (const mock of Object.values(mocks)) mock.mockReset();
		prepared = {
			guild: { id: 'configured' },
			logger: { info: vi.fn(), error: vi.fn() },
			responder: { deferEphemeralReply: vi.fn(), fail: vi.fn(), safeEditReply: vi.fn() }
		};
		interaction = { guildId: 'configured', user: { id: 'staff' }, options: { getBoolean: vi.fn(() => null) } };
		mocks.responder.mockReturnValue(prepared.responder);
		mocks.prepare.mockResolvedValue(prepared);
		mocks.actor.mockResolvedValue({ actor, member: {}, dbUser: {} });
		mocks.deps.mockReturnValue({ target: 'fixed-1011' });
		mocks.run.mockResolvedValue({ kind: 'dry_run_ready', databaseAction: 'insert', messageAction: 'post', participantCount: 75 });
	});

	it.each(['foreign', null])('rejects guild %s before any privileged reads', async (guildId) => {
		interaction.guildId = guildId;
		await invoke();
		expect(prepared.responder.deferEphemeralReply).toHaveBeenCalledOnce();
		expect(prepared.responder.fail).toHaveBeenCalledWith(expect.stringContaining('configured server'), { requestId: true });
		expect(mocks.prepare).not.toHaveBeenCalled();
		expect(mocks.actor).not.toHaveBeenCalled();
		expect(mocks.deps).not.toHaveBeenCalled();
		expect(mocks.run).not.toHaveBeenCalled();
	});

	it('stops if configured guild preparation fails', async () => {
		mocks.prepare.mockResolvedValue(null);
		await invoke();
		expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({ defer: 'ephemeralReply', requestId: true }));
		expect(mocks.actor).not.toHaveBeenCalled();
		expect(mocks.deps).not.toHaveBeenCalled();
	});

	it('rechecks staff before constructing recovery dependencies', async () => {
		mocks.actor.mockResolvedValue(null);
		await invoke();
		expect(mocks.actor).toHaveBeenCalledWith(
			expect.objectContaining({ guild: prepared.guild, discordUserId: 'staff', capabilityRequirement: 'staff' })
		);
		expect(mocks.deps).not.toHaveBeenCalled();
		expect(mocks.run).not.toHaveBeenCalled();
	});

	it.each([null, false, true])('passes explicit apply=%s and the inner actor, defaulting to inspection', async (apply) => {
		interaction.options.getBoolean.mockReturnValue(apply);
		await invoke();
		expect(interaction.options.getBoolean).toHaveBeenCalledWith('apply', false);
		expect(mocks.run).toHaveBeenCalledWith({ target: 'fixed-1011' }, { actor, apply: apply ?? false });
		expect(prepared.responder.safeEditReply).toHaveBeenCalledWith({
			content: expect.stringContaining('Dry run for IAE event 1011: no changes made.')
		});
	});

	it('reports recovery actions without claiming awards', async () => {
		mocks.run.mockResolvedValue({
			kind: 'recovered',
			databaseAction: 'none',
			messageAction: 'adopt',
			participantCount: 75,
			messageId: 'review-1'
		});
		await invoke();
		const content = prepared.responder.safeEditReply.mock.calls[0][0].content;
		expect(content).toContain('review recovery completed');
		expect(content).toContain('Database action: none. Review message action: adopt.');
		expect(content).toContain('No merits or medals were awarded.');
		expect(content).toContain('request-1');
	});

	it('settles service-level forbidden without a success message', async () => {
		mocks.run.mockResolvedValue({ kind: 'forbidden' });
		await invoke();
		expect(prepared.responder.fail).toHaveBeenCalledWith(expect.stringContaining('Only staff'), { requestId: true });
		expect(prepared.responder.safeEditReply).not.toHaveBeenCalled();
	});

	it.each(['run', 'actor', 'prepare'] as const)('settles %s exceptions without exposing internal details', async (step) => {
		mocks[step].mockRejectedValue(new Error('private database details'));
		await invoke();
		expect(prepared.responder.fail).toHaveBeenCalledWith(expect.stringContaining('Could not complete IAE review recovery'), { requestId: true });
		expect(prepared.responder.fail.mock.calls[0][0]).not.toContain('private database');
		expect(prepared.logger.error).toHaveBeenCalled();
		expect(prepared.responder.safeEditReply).not.toHaveBeenCalled();
	});
});
