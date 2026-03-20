import { NameChangeRequestStatus } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	editPendingNameChangeRequest,
	reviewNameChangeDecision,
	submitNameChangeRequest
} from '../../../src/lib/services/name-change/nameChangeService';
import { createStandalonePrisma, pushPrismaSchema, resetDatabase, seedReferenceData, type StandalonePrisma } from '../setup/database';
import { createUser } from '../setup/fixtures';
import { applyDatabaseTestEnv, startPostgresTestContainer, stopPostgresTestContainer } from '../setup/testcontainers';

describe('nameChangeService integration', () => {
	let databaseUrl: string;
	let postgresContainer: Awaited<ReturnType<typeof startPostgresTestContainer>>['postgres'];
	let standalone: StandalonePrisma;
	let nameChangeRepository: typeof import('../../../src/integrations/prisma/repositories').nameChangeRepository;
	let userRepository: typeof import('../../../src/integrations/prisma/repositories').userRepository;
	let closeDb: typeof import('../../../src/integrations/prisma').closeDb;

	beforeAll(async () => {
		const { postgres, databaseUrl: nextDatabaseUrl } = await startPostgresTestContainer();
		postgresContainer = postgres;
		databaseUrl = nextDatabaseUrl;
		applyDatabaseTestEnv(databaseUrl);
		pushPrismaSchema(databaseUrl);
		standalone = createStandalonePrisma(databaseUrl);
		vi.resetModules();
		({ closeDb } = await import('../../../src/integrations/prisma'));
		({ nameChangeRepository, userRepository } = await import('../../../src/integrations/prisma/repositories'));
	});

	beforeEach(async () => {
		await resetDatabase(standalone.prisma);
		await seedReferenceData(standalone.prisma);
	});

	afterAll(async () => {
		if (closeDb) {
			await closeDb();
		}
		if (standalone) {
			await standalone.close();
		}
		if (postgresContainer) {
			await stopPostgresTestContainer(postgresContainer);
		}
	});

	it('submits a request and persists its review-thread reference', async () => {
		const requester = await createUser(standalone.prisma, {
			discordUserId: '5101',
			discordUsername: 'requester-submit',
			discordNickname: 'CurrentName'
		});

		const result = await submitNameChangeRequest(
			{
				getDivisionPrefixes: async () => ['ARC'],
				getRequester: async (discordUserId) => {
					const user = await standalone.prisma.user.findUnique({
						where: {
							discordUserId
						}
					});
					if (!user) {
						return null;
					}

					return {
						dbUserId: user.id,
						currentName: user.discordNickname
					};
				},
				validateRequestedNickname: async () => ({
					kind: 'valid' as const
				}),
				createRequest: nameChangeRepository.createRequest,
				createReviewThread: async () => ({
					reviewThreadId: 'review-thread-5101'
				}),
				saveReviewThreadReference: nameChangeRepository.saveReviewThreadReference
			},
			{
				actor: {
					discordUserId: requester.discordUserId,
					dbUserId: null,
					capabilities: {
						isStaff: false,
						isCenturion: false
					}
				},
				rawRequestedName: 'ARC | NewName',
				reason: 'Updated in-game name',
				requesterTag: 'Requester#5101'
			}
		);

		expect(result).toEqual({
			kind: 'created',
			requestId: 1,
			reviewThreadId: 'review-thread-5101',
			requestedName: 'NewName',
			strippedDivisionPrefix: 'ARC'
		});

		await expect(
			standalone.prisma.nameChangeRequest.findUniqueOrThrow({
				where: {
					id: result.requestId
				}
			})
		).resolves.toMatchObject({
			requesterUserId: requester.id,
			currentName: 'CurrentName',
			requestedName: 'NewName',
			reason: 'Updated in-game name',
			status: NameChangeRequestStatus.PENDING,
			reviewThreadId: 'review-thread-5101'
		});
	});

	it('edits a pending request through the service using real persistence', async () => {
		const requester = await createUser(standalone.prisma, {
			discordUserId: '5102',
			discordUsername: 'requester-edit'
		});
		const request = await standalone.prisma.nameChangeRequest.create({
			data: {
				requesterUserId: requester.id,
				currentName: 'OldName',
				requestedName: 'RequestedBefore',
				reason: 'Need update'
			}
		});

		const result = await editPendingNameChangeRequest(
			{
				getDivisionPrefixes: async () => ['ARC'],
				findRequest: nameChangeRepository.getRequest,
				validateRequestedNickname: async () => ({
					kind: 'valid' as const
				}),
				updatePendingRequestedName: nameChangeRepository.updatePendingRequestedName
			},
			{
				actor: {
					discordUserId: 'reviewer-edit',
					dbUserId: 'reviewer-db-edit',
					capabilities: {
						isStaff: true,
						isCenturion: false
					}
				},
				requestId: request.id,
				rawRequestedName: 'ARC | EditedName'
			}
		);

		expect(result).toEqual({
			kind: 'edited',
			requestId: request.id,
			requesterDiscordUserId: requester.discordUserId,
			previousRequestedName: 'RequestedBefore',
			requestedName: 'EditedName'
		});
		await expect(
			standalone.prisma.nameChangeRequest.findUniqueOrThrow({
				where: {
					id: request.id
				}
			})
		).resolves.toMatchObject({
			requestedName: 'EditedName',
			status: NameChangeRequestStatus.PENDING
		});
	});

	it('approves a request and persists reviewer plus requester nickname changes', async () => {
		const requester = await createUser(standalone.prisma, {
			discordUserId: '5103',
			discordUsername: 'requester-review',
			discordNickname: 'OldName'
		});
		const reviewer = await createUser(standalone.prisma, {
			discordUserId: '5104',
			discordUsername: 'reviewer-review'
		});
		const request = await standalone.prisma.nameChangeRequest.create({
			data: {
				requesterUserId: requester.id,
				currentName: 'OldName',
				requestedName: 'ApprovedName',
				reason: 'Fresh start'
			}
		});

		const result = await reviewNameChangeDecision(
			{
				findRequest: nameChangeRepository.getRequest,
				validateRequestedNickname: async () => ({
					kind: 'valid' as const
				}),
				reviewRequest: nameChangeRepository.reviewRequest,
				updatePersistedNickname: userRepository.updateNickname,
				syncApprovedNickname: async () => undefined
			},
			{
				actor: {
					discordUserId: reviewer.discordUserId,
					dbUserId: reviewer.id,
					capabilities: {
						isStaff: true,
						isCenturion: false
					}
				},
				requestId: request.id,
				decision: 'approve'
			}
		);

		expect(result.kind).toBe('reviewed');
		await expect(
			standalone.prisma.nameChangeRequest.findUniqueOrThrow({
				where: {
					id: request.id
				}
			})
		).resolves.toMatchObject({
			status: NameChangeRequestStatus.APPROVED,
			reviewerUserId: reviewer.id
		});
		await expect(
			standalone.prisma.user.findUniqueOrThrow({
				where: {
					id: requester.id
				}
			})
		).resolves.toMatchObject({
			discordNickname: 'ApprovedName'
		});
	});
});
