import type { GuildMember } from "discord.js";
import { container } from '@sapphire/framework';

import { ENV_DISCORD } from "../../../../config/env";
import { getAuxVcCredit, upsertAuxVcCredit, type AuxVcCreditRow } from "../../../../integrations/redis/auxVcCredit";
import { promoteAuxMemberToLgn } from "./promoteAuxMemberToLgn";
import { createChildExecutionContext, type ExecutionContext } from '../../../logging/executionContext';

type AwardCreditToMemberParams = {
    discordUser: GuildMember;
    context: ExecutionContext;
};

export async function awardCreditToMember({ discordUser, context }: AwardCreditToMemberParams) {
    const caller = 'awardCreditToMember';
    const logger = context.logger.child({ caller });

    const dbUser = await container.utilities.userDirectory.getOrThrow({ discordUserId: discordUser.id }).catch((err) => {
        logger.error(
            {
                discordUserId: discordUser.id,
            },
            'User not found in database',
        );
        throw err;
    });

    let userVcCreditState:
        Omit<AuxVcCreditRow, 'createdAt' | 'updatedAt'>
        | AuxVcCreditRow
        | null = await getAuxVcCredit({ discordUserId: discordUser.id });
    if (!userVcCreditState) {
        userVcCreditState = {
            discordUserId: discordUser.id,
            userId: dbUser.id,
            credits: 0,
            eligibleAccumulatedMs: 0,
            lastEvaluatedAtMs: 0,
        };
    }

    const updatedMsAccumulated = userVcCreditState.eligibleAccumulatedMs + ENV_DISCORD.VC_ACTIVITY_TICK_SECONDS * 1000;
    const updatedEarnedCredits = userVcCreditState.credits + Math.floor(updatedMsAccumulated / ENV_DISCORD.AUX_VC_CREDIT_INTERVAL_SECONDS / 1000);
    const carryOverAccumulatedMs = updatedMsAccumulated % ENV_DISCORD.AUX_VC_CREDIT_INTERVAL_SECONDS / 1000;

    if (updatedEarnedCredits >= ENV_DISCORD.AUX_VC_REQUIRED_CREDITS) {
        await promoteAuxMemberToLgn({
            discordUser,
            context: createChildExecutionContext({
                context,
                bindings: {
                    step: 'promoteAuxMemberToLgn',
                },
            }),
        });
        logger.info(
            {
                discordUserId: discordUser.id,
                discordUsername: discordUser.user.username,
                discordNickname: discordUser.nickname ?? discordUser.user.globalName ?? discordUser.user.username,
                dbUserId: dbUser.id,
                updatedEarnedCredits,
                requiredCredits: ENV_DISCORD.AUX_VC_REQUIRED_CREDITS,
            },
            'Promoted AUX member to LGN for meeting required voice activity',
        );
        return;
    }

    await upsertAuxVcCredit({
        discordUserId: discordUser.id,
        userId: dbUser.id,
        credits: updatedEarnedCredits,
        eligibleAccumulatedMs: carryOverAccumulatedMs,
        lastEvaluatedAtMs: Date.now(),
    });

    if (updatedEarnedCredits > 0) {
        logger.trace(
            {
                discordUserId: discordUser.id,
                discordUsername: discordUser.user.username,
                discordNickname: discordUser.nickname ?? discordUser.user.globalName ?? discordUser.user.username,
                dbUserId: dbUser.id,
                updatedEarnedCredits,
                requiredCredits: ENV_DISCORD.AUX_VC_REQUIRED_CREDITS,
            },
            'Awarded AUX VC credit',
        );
        return;
    }

    logger.trace(
        {
            discordUserId: discordUser.id,
            discordUsername: discordUser.user.username,
            discordNickname: discordUser.nickname ?? discordUser.user.globalName ?? discordUser.user.username,
            dbUserId: dbUser.id,
            updatedEarnedCredits,
            requiredCredits: ENV_DISCORD.AUX_VC_REQUIRED_CREDITS,
        },
        'Recorded AUX VC eligibility progress without awarding full credit',
    );
}
