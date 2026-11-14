import { EventSessionChannelKind, EventSessionState } from '@prisma/client';
import { RESTJSONErrorCodes, type Guild, type Role } from 'discord.js';
import type { Subcommand } from '@sapphire/plugin-subcommands';
import { z } from 'zod';

import { staffMedalRepository } from '../../../../integrations/prisma/repositories';
import type { ResolvedRecentMedalEvent } from '../../../../integrations/prisma/staff/medal/read';
import { getVoiceBasedGuildChannel } from '../../../discord/guild/configuredGuild';
import { prepareGuildInteraction } from '../../../discord/interactions/prepareGuildInteraction';
import { parseDiscordUserIdInput } from '../../../discord/members/memberDirectory';
import type { ExecutionContext } from '../../../logging/executionContext';
import { MissingTrackedChannelWarningStore } from '../../../services/event-tracking/missingTrackedChannelWarningStore';
import { resolveTrackedAttendeeDiscordUserIds } from '../../../services/event-tracking/resolveTrackedAttendees';
import { createGuildMemberDirectMessageGateway } from '../../../services/guild-member/guildMemberDirectMessageGateway';
import { MEDAL_ROLE_PREFIX, SEVEN_DAYS_IN_MS } from './staffMedalConstants';

type HandleStaffMedalGiveParams = {
	interaction: Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
	/** Injectable clock and pacing for deterministic, side-effect-free bulk tests. */
	bulkRuntime?: { now: () => number; sleep: (ms: number) => Promise<void> };
};

type MedalGrantTarget = {
	discordUserId: string;
	discordNickname: string | null;
	discordUsername: string | null;
};

// Serialize medal runs per guild and resolved role, including single-target grants.
// This guard is process-local; the deployment runs one bot process.
const activeMedalRuns = new Set<string>();
const MEDAL_BULK_DEADLINE_MS = 12 * 60_000;
const MEDAL_BULK_PACE_MS = 1_000;
const EVENT_SESSION_ID_SCHEMA = z.coerce.number().int().positive();
export async function handleStaffMedalGive({ interaction, context, bulkRuntime }: HandleStaffMedalGiveParams) {
	const prepared = await prepareGuildInteraction({
		interaction,
		context,
		caller: 'handleStaffMedalGive',
		guildLogMessage: 'Failed to resolve configured guild for staff medal give command',
		guildFailureMessage: 'Failed to resolve guild for medal grant.',
		requestId: true,
		defer: 'ephemeralReply'
	});
	if (!prepared) {
		return;
	}
	const { guild, logger, responder } = prepared;

	const medalSelection = interaction.options.getString('medal_name', true).trim();
	const rawEventSelection = interaction.options.getString('event_name', false);
	const rawUserSelection = interaction.options.getString('user_name', false);
	const requestedDiscordUserId = parseDiscordUserIdInput(rawUserSelection);
	const parsedEventSessionId = rawEventSelection ? EVENT_SESSION_ID_SCHEMA.safeParse(rawEventSelection) : null;

	if (rawEventSelection && !parsedEventSessionId?.success) {
		await responder.safeEditReply({
			content: `Invalid \`event_name\` value. Select an event from autocomplete. requestId=\`${context.requestId}\``
		});
		return;
	}

	if (rawUserSelection && !requestedDiscordUserId) {
		await responder.safeEditReply({
			content: `Invalid \`user_name\` value. Select a user from autocomplete. requestId=\`${context.requestId}\``
		});
		return;
	}

	if (!parsedEventSessionId?.success && !requestedDiscordUserId) {
		await responder.safeEditReply({
			content:
				`You must select either \`event_name\` or \`user_name\`. ` +
				`Use \`event_name\` for bulk medals, or specify a target user. requestId=\`${context.requestId}\``
		});
		return;
	}

	let runKey: string | undefined;
	try {
		const medalRole = await resolveMedalRole({
			guild,
			selection: medalSelection
		});
		if (!medalRole) {
			await responder.safeEditReply({
				content: `Invalid \`medal_name\` value. Select a medal role from autocomplete. requestId=\`${context.requestId}\``
			});
			return;
		}

		const resolvedRunKey = `${guild.id}:${medalRole.id}`;
		if (activeMedalRuns.has(resolvedRunKey)) {
			await responder.safeEditReply({
				content: `A grant for this medal is already running. Wait for it to finish before retrying. requestId=\`${context.requestId}\``
			});
			return;
		}
		activeMedalRuns.add(resolvedRunKey);
		runKey = resolvedRunKey;

		const sendDirectMessage = createGuildMemberDirectMessageGateway({
			guild,
			logger
		});

		if (parsedEventSessionId?.success) {
			const recentEvent = await staffMedalRepository.getRecentEventById({
				eventSessionId: parsedEventSessionId.data,
				since: new Date(Date.now() - SEVEN_DAYS_IN_MS)
			});
			if (!recentEvent) {
				await responder.safeEditReply({
					content: `Selected event is not available. Choose an event created in the last 7 days. requestId=\`${context.requestId}\``
				});
				return;
			}

			if (requestedDiscordUserId) {
				const attendee = await resolveSingleTargetForEvent({
					guild,
					context,
					eventSession: recentEvent,
					discordUserId: requestedDiscordUserId
				});
				if (!attendee) {
					await responder.safeEditReply({
						content:
							`<@${requestedDiscordUserId}> did not attend **${recentEvent.name}**. ` +
							`Select an attendee from autocomplete. requestId=\`${context.requestId}\``
					});
					return;
				}

				const singleResult = await grantMedalToOne({
					guild,
					role: medalRole,
					target: attendee,
					sendDirectMessage,
					dmContent: buildMedalDirectMessage({
						medalRoleName: medalRole.name,
						eventName: recentEvent.name
					}),
					reason: `Awarded ${medalRole.name} via /staff medal_give for event ${recentEvent.name}`,
					logger
				});

				logger.info(
					{
						medalRoleId: medalRole.id,
						medalRoleName: medalRole.name,
						eventSessionId: recentEvent.id,
						targetDiscordUserId: attendee.discordUserId,
						result: singleResult.kind
					},
					'staff.medal_give.single.completed'
				);

				await responder.safeEditReply({
					content: buildSingleGrantReply({
						medalRoleName: medalRole.name,
						targetDiscordUserId: attendee.discordUserId,
						eventName: recentEvent.name,
						result: singleResult,
						requestId: context.requestId
					})
				});
				return;
			}

			if (recentEvent.state !== EventSessionState.FINALIZED_WITH_MERITS) {
				const bulkGrantFailureMessage =
					recentEvent.state === EventSessionState.FINALIZED_NO_MERITS
						? "You can't award all attendees with a medal because the event was submitted without merits."
						: 'You must first end the event and submit with merits to award merit-receiving attendees with this medal.';
				await responder.safeEditReply({
					content: `${bulkGrantFailureMessage} requestId=\`${context.requestId}\``
				});
				return;
			}

			const recipients = await staffMedalRepository.listEventMeritRecipients({
				eventSessionId: recentEvent.id
			});
			await responder.safeEditReply({
				content: `Medal grant started for ${recipients.length} recipients. Large runs may stop early; rerun to process remaining recipients. requestId=\`${context.requestId}\``
			});
			const summary = await grantMedalToMany({
				bulkRuntime,
				guild,
				role: medalRole,
				targets: recipients.map((recipient) => recipient.user),
				sendDirectMessage,
				dmContent: buildMedalDirectMessage({
					medalRoleName: medalRole.name,
					eventName: recentEvent.name
				}),
				reason: `Awarded ${medalRole.name} via /staff medal_give for event ${recentEvent.name}`,
				logger
			});

			const bulkLogBindings = {
				medalRoleId: medalRole.id,
				medalRoleName: medalRole.name,
				eventSessionId: recentEvent.id,
				...summary
			};
			if (summary.failed > 0 || summary.remaining > 0) {
				logger.warn(bulkLogBindings, 'staff.medal_give.bulk.completed_with_failures');
			} else {
				logger.info(bulkLogBindings, 'staff.medal_give.bulk.completed');
			}

			await responder.safeEditReply({
				content: buildBulkGrantReply({
					medalRoleName: medalRole.name,
					eventName: recentEvent.name,
					summary,
					requestId: context.requestId
				})
			});
			return;
		}

		const eligibleUser = await staffMedalRepository.getStandaloneEligibleUserByDiscordUserId({
			discordUserId: requestedDiscordUserId!
		});
		if (!eligibleUser) {
			await responder.safeEditReply({
				content:
					`<@${requestedDiscordUserId!}> is not eligible for a standalone medal grant. ` +
					`Select a user with INT, LGN, or RES from autocomplete. requestId=\`${context.requestId}\``
			});
			return;
		}

		const singleResult = await grantMedalToOne({
			guild,
			role: medalRole,
			target: eligibleUser,
			sendDirectMessage,
			dmContent: buildMedalDirectMessage({
				medalRoleName: medalRole.name
			}),
			reason: `Awarded ${medalRole.name} via /staff medal_give`,
			logger
		});

		logger.info(
			{
				medalRoleId: medalRole.id,
				medalRoleName: medalRole.name,
				targetDiscordUserId: eligibleUser.discordUserId,
				result: singleResult.kind
			},
			'staff.medal_give.single.completed'
		);

		await responder.safeEditReply({
			content: buildSingleGrantReply({
				medalRoleName: medalRole.name,
				targetDiscordUserId: eligibleUser.discordUserId,
				eventName: null,
				result: singleResult,
				requestId: context.requestId
			})
		});
	} catch (error: unknown) {
		logger.error(
			{
				err: error,
				requestId: context.requestId
			},
			'Unhandled error while running staff medal give command'
		);
		await responder.fail('Failed to grant medal due to an unexpected error.', {
			requestId: true
		});
	} finally {
		if (runKey) activeMedalRuns.delete(runKey);
	}
}

async function resolveSingleTargetForEvent({
	guild,
	context,
	eventSession,
	discordUserId
}: {
	guild: Guild;
	context: ExecutionContext;
	eventSession: ResolvedRecentMedalEvent;
	discordUserId: string;
}) {
	const attendee = await staffMedalRepository.getEventAttendeeByDiscordUserId({
		eventSessionId: eventSession.id,
		discordUserId
	});
	if (attendee) {
		return attendee.user;
	}

	if (eventSession.state !== EventSessionState.ACTIVE) {
		return null;
	}

	const trackedVoiceChannelIds =
		eventSession.channels
			.filter((channel) => channel.kind === EventSessionChannelKind.PARENT_VC || channel.kind === EventSessionChannelKind.CHILD_VC)
			.map((channel) => channel.channelId) ?? [];

	if (trackedVoiceChannelIds.length > 0) {
		const activeAttendeeDiscordUserIds = await resolveTrackedAttendeeDiscordUserIds({
			guild,
			eventSessionId: eventSession.id,
			trackedVoiceChannelIds,
			context,
			warningStore: new MissingTrackedChannelWarningStore(),
			resolveVoiceChannel: ({ guild: targetGuild, channelId }) =>
				getVoiceBasedGuildChannel({
					guild: targetGuild,
					channelId
				})
		});
		if (activeAttendeeDiscordUserIds.includes(discordUserId)) {
			return {
				discordUserId,
				discordNickname: null,
				discordUsername: null
			};
		}
	}

	return staffMedalRepository.getStandaloneEligibleUserByDiscordUserId({
		discordUserId
	});
}

async function resolveMedalRole({ guild, selection }: { guild: Guild; selection: string }) {
	const roles = await guild.roles.fetch();
	const normalizedSelection = selection.trim().toLowerCase();
	const directMatch = roles.get(selection);
	if (directMatch) {
		return directMatch.name.startsWith(MEDAL_ROLE_PREFIX) ? directMatch : null;
	}

	return (
		[...roles.values()].find(
			(role): role is Role => Boolean(role) && role.name.startsWith(MEDAL_ROLE_PREFIX) && role.name.toLowerCase() === normalizedSelection
		) ?? null
	);
}

async function grantMedalToMany({
	bulkRuntime,
	guild,
	role,
	targets,
	sendDirectMessage,
	dmContent,
	reason,
	logger
}: {
	bulkRuntime?: HandleStaffMedalGiveParams['bulkRuntime'];
	guild: Guild;
	role: Role;
	targets: MedalGrantTarget[];
	sendDirectMessage: ReturnType<typeof createGuildMemberDirectMessageGateway>;
	dmContent: string;
	reason: string;
	logger: ExecutionContext['logger'];
}) {
	const now = bulkRuntime?.now ?? Date.now;
	const sleep = bulkRuntime?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const startedAt = now();
	const uniqueTargets = [...new Map(targets.map((target) => [target.discordUserId, target])).values()];
	const summary = {
		eligible: uniqueTargets.length,
		granted: 0,
		alreadyHadRole: 0,
		notInGuild: 0,
		failed: 0,
		dmSent: 0,
		processed: 0,
		remaining: uniqueTargets.length
	};

	for (const target of uniqueTargets) {
		if (now() - startedAt >= MEDAL_BULK_DEADLINE_MS) break;
		const result = await grantMedalToOne({
			guild,
			role,
			target,
			sendDirectMessage,
			dmContent,
			reason,
			logger
		});

		summary.processed++;
		summary.remaining--;
		if ((result.kind === 'granted' || result.kind === 'failed') && summary.remaining > 0) {
			await sleep(MEDAL_BULK_PACE_MS);
		}
		if (result.kind === 'granted') {
			summary.granted += 1;
			if (result.dmSent) {
				summary.dmSent += 1;
			}
			continue;
		}
		if (result.kind === 'already_has_role') {
			summary.alreadyHadRole += 1;
			continue;
		}
		if (result.kind === 'failed') {
			summary.failed += 1;
			continue;
		}

		summary.notInGuild += 1;
	}

	return summary;
}

async function grantMedalToOne({
	guild,
	role,
	target,
	sendDirectMessage,
	dmContent,
	reason,
	logger
}: {
	guild: Guild;
	role: Role;
	target: MedalGrantTarget;
	sendDirectMessage: ReturnType<typeof createGuildMemberDirectMessageGateway>;
	dmContent: string;
	reason: string;
	logger: ExecutionContext['logger'];
}): Promise<{ kind: 'granted'; dmSent: boolean } | { kind: 'already_has_role' } | { kind: 'not_in_guild' } | { kind: 'failed' }> {
	let member;
	try {
		member = await guild.members.fetch(target.discordUserId);
	} catch (error: unknown) {
		if (typeof error === 'object' && error !== null && 'code' in error && error.code === RESTJSONErrorCodes.UnknownMember) {
			return { kind: 'not_in_guild' };
		}
		logger.warn({ err: error, targetDiscordUserId: target.discordUserId }, 'Failed to fetch medal recipient');
		return { kind: 'failed' };
	}
	if (!member) {
		return {
			kind: 'not_in_guild'
		};
	}

	if (member.roles.cache.has(role.id)) {
		return {
			kind: 'already_has_role'
		};
	}

	try {
		await member.roles.add(role.id, reason);
	} catch (error: unknown) {
		logger.warn(
			{
				err: error,
				targetDiscordUserId: target.discordUserId,
				roleId: role.id,
				roleName: role.name
			},
			'Failed to grant medal role to target user'
		);
		return {
			kind: 'failed'
		};
	}

	const dmSent = await sendDirectMessage({
		discordUserId: target.discordUserId,
		content: dmContent,
		logMessage: 'Failed to DM medal recipient'
	}).catch((error: unknown) => {
		logger.warn({ err: error, targetDiscordUserId: target.discordUserId }, 'Failed to DM medal recipient after granting role');
		return false;
	});

	return {
		kind: 'granted',
		dmSent
	};
}

function buildMedalDirectMessage({ medalRoleName, eventName }: { medalRoleName: string; eventName?: string | null }) {
	return [`You were awarded the **${medalRoleName}** medal.`, eventName ? `Related event: ${eventName}` : null]
		.filter((line): line is string => Boolean(line))
		.join('\n');
}

function buildSingleGrantReply({
	medalRoleName,
	targetDiscordUserId,
	eventName,
	result,
	requestId
}: {
	medalRoleName: string;
	targetDiscordUserId: string;
	eventName: string | null;
	result: Awaited<ReturnType<typeof grantMedalToOne>>;
	requestId: string;
}) {
	const eventLine = eventName ? ` for **${eventName}**` : '';
	if (result.kind === 'not_in_guild') {
		return `Could not grant **${medalRoleName}** to <@${targetDiscordUserId}>${eventLine} because they are not in the guild. requestId=\`${requestId}\``;
	}
	if (result.kind === 'already_has_role') {
		return `<@${targetDiscordUserId}> already has **${medalRoleName}**${eventLine}. requestId=\`${requestId}\``;
	}
	if (result.kind === 'failed') {
		return `Failed to grant **${medalRoleName}** to <@${targetDiscordUserId}>${eventLine}. Please check bot permissions and try again. requestId=\`${requestId}\``;
	}

	const dmLine = result.dmSent ? 'Recipient notified via DM.' : 'Could not DM recipient (DMs may be disabled).';
	return `Granted **${medalRoleName}** to <@${targetDiscordUserId}>${eventLine}.\n${dmLine} requestId=\`${requestId}\``;
}

function buildBulkGrantReply({
	medalRoleName,
	eventName,
	summary,
	requestId
}: {
	medalRoleName: string;
	eventName: string;
	summary: Awaited<ReturnType<typeof grantMedalToMany>>;
	requestId: string;
}) {
	return [
		`Processed **${medalRoleName}** for **${eventName}**.`,
		`Eligible merit recipients: ${summary.eligible}`,
		`Processed: ${summary.processed}; remaining: ${summary.remaining}`,
		...(summary.remaining > 0 ? ['Stopped at the time limit. Rerun this command to continue; existing medal roles are skipped.'] : []),
		`Granted: ${summary.granted}`,
		`Already had role: ${summary.alreadyHadRole}`,
		`Not in guild: ${summary.notInGuild}`,
		`Failed: ${summary.failed}`,
		`Recipient DMs sent: ${summary.dmSent}/${summary.granted}`,
		`requestId=\`${requestId}\``
	].join('\n');
}
