import { EventSessionChannelKind, EventSessionState } from '@prisma/client';
import type { Guild, Role } from 'discord.js';
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

type HandleStaffMedalGiveParams = {
	interaction: Subcommand.ChatInputCommandInteraction;
	context: ExecutionContext;
};

type MedalGrantTarget = {
	discordUserId: string;
	discordNickname: string | null;
	discordUsername: string | null;
};

const EVENT_SESSION_ID_SCHEMA = z.coerce.number().int().positive();
const SEVEN_DAYS_IN_MS = 7 * 24 * 60 * 60 * 1000;
const MEDAL_ROLE_PREFIX = 'Medal:';

export async function handleStaffMedalGive({ interaction, context }: HandleStaffMedalGiveParams) {
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
					reason: `Awarded ${medalRole.name} via /staff medal-give for event ${recentEvent.name}`
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
			const summary = await grantMedalToMany({
				guild,
				role: medalRole,
				targets: recipients.map((recipient) => recipient.user),
				sendDirectMessage,
				dmContent: buildMedalDirectMessage({
					medalRoleName: medalRole.name,
					eventName: recentEvent.name
				}),
				reason: `Awarded ${medalRole.name} via /staff medal-give for event ${recentEvent.name}`
			});

			logger.info(
				{
					medalRoleId: medalRole.id,
					medalRoleName: medalRole.name,
					eventSessionId: recentEvent.id,
					...summary
				},
				'staff.medal_give.bulk.completed'
			);

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
			reason: `Awarded ${medalRole.name} via /staff medal-give`
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

	return (
		roles.get(selection) ??
		[...roles.values()].find(
			(role): role is Role => Boolean(role) && role.name.startsWith(MEDAL_ROLE_PREFIX) && role.name.toLowerCase() === normalizedSelection
		) ??
		null
	);
}

async function grantMedalToMany({
	guild,
	role,
	targets,
	sendDirectMessage,
	dmContent,
	reason
}: {
	guild: Guild;
	role: Role;
	targets: MedalGrantTarget[];
	sendDirectMessage: ReturnType<typeof createGuildMemberDirectMessageGateway>;
	dmContent: string;
	reason: string;
}) {
	const uniqueTargets = [...new Map(targets.map((target) => [target.discordUserId, target])).values()];
	const summary = {
		eligible: uniqueTargets.length,
		granted: 0,
		alreadyHadRole: 0,
		notInGuild: 0,
		dmSent: 0
	};

	for (const target of uniqueTargets) {
		const result = await grantMedalToOne({
			guild,
			role,
			target,
			sendDirectMessage,
			dmContent,
			reason
		});

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
	reason
}: {
	guild: Guild;
	role: Role;
	target: MedalGrantTarget;
	sendDirectMessage: ReturnType<typeof createGuildMemberDirectMessageGateway>;
	dmContent: string;
	reason: string;
}): Promise<{ kind: 'granted'; dmSent: boolean } | { kind: 'already_has_role' } | { kind: 'not_in_guild' }> {
	const member = await guild.members.fetch(target.discordUserId).catch(() => null);
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

	await member.roles.add(role.id, reason);

	const dmSent = await sendDirectMessage({
		discordUserId: target.discordUserId,
		content: dmContent,
		logMessage: 'Failed to DM medal recipient'
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
		`Granted: ${summary.granted}`,
		`Already had role: ${summary.alreadyHadRole}`,
		`Not in guild: ${summary.notInGuild}`,
		`Recipient DMs sent: ${summary.dmSent}/${summary.granted}`,
		`requestId=\`${requestId}\``
	].join('\n');
}
