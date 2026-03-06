import { DivisionKind } from '@prisma/client';
import { type ChatInputCommandInteraction, type Guild, type GuildMember, MessageFlags } from 'discord.js';
import { container } from '@sapphire/framework';
import { z } from 'zod';

import { awardManualMerit, findUniqueEventSession, getUserTotalMerits, upsertUser } from '../../../integrations/prisma';
import { isNicknameTooLongError } from '../../errors/nicknameTooLongError';
import { createChildExecutionContext, type ExecutionContext } from '../../logging/executionContext';
import { notifyMeritRankUp } from './notifyMeritRankUp';

type HandleGiveMeritParams = {
	interaction: ChatInputCommandInteraction;
	context: ExecutionContext;
};

const PLAYER_DISCORD_USER_ID_SCHEMA = z.string().trim().min(1);
const NUMBER_OF_MERITS_SCHEMA = z.number().int().positive().max(1_000);
const EVENT_SESSION_ID_SCHEMA = z.coerce.number().int().positive();

export async function handleGiveMerit({ interaction, context }: HandleGiveMeritParams) {
	const caller = 'handleGiveMerit';
	const logger = context.logger.child({ caller });

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	let guild: Guild;
	try {
		guild = await container.utilities.guild.getOrThrow();
	} catch (error) {
		logger.error(
			{
				err: error
			},
			'Failed to resolve configured guild while handling manual merit award'
		);

		await interaction.editReply({
			content: `Could not resolve configured guild. Please contact TECH with: requestId=${context.requestId}`
		});
		return;
	}

	const rawPlayerDiscordUserId = interaction.options.getString('player_name', true);
	const parsedPlayerInput = PLAYER_DISCORD_USER_ID_SCHEMA.safeParse(rawPlayerDiscordUserId);
	if (!parsedPlayerInput.success) {
		await interaction.editReply({
			content: 'Invalid player selection. Please use the autocomplete options.'
		});
		return;
	}

	const merits = interaction.options.getInteger('number_of_merits', true);
	const parsedMerits = NUMBER_OF_MERITS_SCHEMA.safeParse(merits);
	if (!parsedMerits.success) {
		await interaction.editReply({
			content: 'Invalid merit amount. Please provide a positive integer.'
		});
		return;
	}

	const reason = interaction.options.getString('reason')?.trim() ?? null;

	const rawEventSelection = interaction.options.getString('existing_event');
	const parsedEventSessionId = rawEventSelection ? EVENT_SESSION_ID_SCHEMA.safeParse(rawEventSelection) : null;
	if (rawEventSelection && !parsedEventSessionId?.success) {
		await interaction.editReply({
			content: 'Invalid event selection. Please use the autocomplete options.'
		});
		return;
	}

	const targetMember = await resolveTargetMember({
		guild,
		playerInput: parsedPlayerInput.data
	});
	if (!targetMember || targetMember.user.bot) {
		await interaction.editReply({
			content: 'Selected player was not found. Please use the autocomplete options.'
		});
		return;
	}

	const awarderMember = await guild.members.fetch(interaction.user.id).catch(() => null);
	if (!awarderMember) {
		await interaction.editReply({
			content: `Could not resolve your member record. Please contact TECH with: requestId=${context.requestId}`
		});
		return;
	}
	const requesterIsStaff = await container.utilities.divisionRolePolicy.memberHasDivisionKindRole({
		member: awarderMember,
		requiredRoleKinds: [DivisionKind.STAFF]
	});
	if (!requesterIsStaff) {
		await interaction.editReply({
			content: 'Only staff can use this command.'
		});
		return;
	}

	const targetDbUser = await upsertUser({
		discordUserId: targetMember.id,
		discordUsername: targetMember.user.username,
		discordNickname: targetMember.user.globalName ?? targetMember.user.username,
		discordAvatarUrl: targetMember.user.displayAvatarURL()
	});
	const awarderDbUser = await upsertUser({
		discordUserId: awarderMember.id,
		discordUsername: awarderMember.user.username,
		discordNickname: awarderMember.user.globalName ?? awarderMember.user.username,
		discordAvatarUrl: awarderMember.user.displayAvatarURL()
	});

	let linkedEvent: Awaited<ReturnType<typeof findUniqueEventSession>> | null = null;
	if (parsedEventSessionId?.success) {
		linkedEvent = await findUniqueEventSession({
			eventSessionId: parsedEventSessionId.data
		});
		if (!linkedEvent) {
			await interaction.editReply({
				content: 'Selected event was not found.'
			});
			return;
		}

		const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1_000;
		if (linkedEvent.createdAt.getTime() < fiveDaysAgo) {
			await interaction.editReply({
				content: 'Selected event is older than 5 days and cannot be linked for this command.'
			});
			return;
		}
	}

	const award = await awardManualMerit({
		recipientDbUserId: targetDbUser.id,
		awardedByDbUserId: awarderDbUser.id,
		amount: parsedMerits.data,
		reason,
		eventSessionId: linkedEvent?.id ?? null
	});

	let recipientNicknameTooLong = false;
	await container.utilities.member
		.syncComputedNickname({
			member: targetMember,
			context: createChildExecutionContext({
				context,
				bindings: {
					step: 'syncRecipientNicknameAfterManualMerit'
				}
			}),
			setReason: 'Manual merit rank sync'
		})
		.catch((error: unknown) => {
			if (isNicknameTooLongError(error)) {
				recipientNicknameTooLong = true;
			}
			logger.warn(
				{
					err: error,
					targetDiscordUserId: targetMember.id
				},
				'Failed to sync recipient nickname after manual merit award'
			);
		});

	const awarderNicknameForDm =
		(
			await container.utilities.member
				.computeNickname({
					member: awarderMember,
					context,
					contextBindings: {
						step: 'buildAwarderNicknameForManualMeritDm'
					}
				})
				.catch((error: unknown) => {
					logger.warn(
						{
							err: error,
							awarderDiscordUserId: awarderMember.id
						},
						'Failed to build awarder nickname for manual merit DM'
					);
					return null;
				})
		)?.computedNickname ?? awarderMember.displayName;

	const currentTotalMerits = await getUserTotalMerits({
		userDbUserId: targetDbUser.id
	});
	const previousTotalMerits = Math.max(0, currentTotalMerits - parsedMerits.data);
	await notifyMeritRankUp({
		member: targetMember,
		previousTotalMerits,
		currentTotalMerits,
		logger
	});

	const dmEventLine = linkedEvent ? `\nEvent: ${linkedEvent.name}` : '';
	const dmReasonLine = reason ? `\nReason: ${reason}` : '';
	const dmSent = await targetMember.user
		.send(
			`You were awarded **${parsedMerits.data} merit${parsedMerits.data === 1 ? '' : 's'}** by **${awarderNicknameForDm}**.${dmEventLine}${dmReasonLine}`
		)
		.then(() => true)
		.catch((error: unknown) => {
			logger.warn(
				{
					err: error,
					targetDiscordUserId: targetMember.id,
					meritRecordId: award.id
				},
				'Failed to DM manual merit award to recipient'
			);
			return false;
		});

	const eventLine = linkedEvent ? `\nLinked event: **${linkedEvent.name}**` : '';
	const reasonLine = reason ? `\nReason: ${reason}` : '';
	const dmLine = dmSent ? '\nRecipient notified via DM.' : '\nCould not DM recipient (DMs may be disabled).';
	const nicknameWarningLine = recipientNicknameTooLong
		? '\nNickname was not updated because the computed nickname exceeds Discord limits. Ask the user to shorten their base nickname.'
		: '';
	await interaction.editReply({
		content: `Awarded **${parsedMerits.data} merits** to <@${targetMember.id}>${eventLine}${reasonLine}${dmLine}${nicknameWarningLine}`
	});

	logger.info(
		{
			targetDiscordUserId: targetMember.id,
			awarderDiscordUserId: interaction.user.id,
			amount: parsedMerits.data,
			reason,
			eventSessionId: linkedEvent?.id ?? null,
			meritRecordId: award.id
		},
		'Processed manual merit award'
	);
}

async function resolveTargetMember({ guild, playerInput }: { guild: Guild; playerInput: string }) {
	const trimmed = playerInput.trim();
	if (/^\d{15,22}$/.test(trimmed)) {
		return guild.members.fetch(trimmed).catch(() => null);
	}

	const normalizedInput = normalizeMemberMatchKey(trimmed);
	const exactMatches = [...guild.members.cache.values()].filter((member) => {
		if (member.user.bot) {
			return false;
		}

		return getMemberMatchCandidates(member).some((candidate) => normalizeMemberMatchKey(candidate) === normalizedInput);
	});
	if (exactMatches.length === 1) {
		return exactMatches[0];
	}

	const looseMatches = [...guild.members.cache.values()].filter((member) => {
		if (member.user.bot) {
			return false;
		}

		return getMemberMatchCandidates(member).some((candidate) => normalizeMemberMatchKey(candidate).includes(normalizedInput));
	});
	if (looseMatches.length === 1) {
		return looseMatches[0];
	}

	return null;
}

function getMemberMatchCandidates(member: GuildMember) {
	return [member.displayName, member.nickname ?? '', member.user.globalName ?? '', member.user.username].filter((value) => value.trim().length > 0);
}

function normalizeMemberMatchKey(value: string) {
	return value.trim().toLowerCase();
}
