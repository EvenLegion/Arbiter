import { container } from '@sapphire/framework';
import { monitorState } from "./monitorState";
import { getEligibleAuxMemberIds } from "./getEligibleAuxMemberIds";
import type { ExecutionContext } from '../../../logging/executionContext';

type ReconcileEligibilityParams = {
    context: ExecutionContext;
};

export async function reconcileEligibility({ context }: ReconcileEligibilityParams) {
    const caller = 'reconcileEligibility';
    const logger = context.logger.child({ caller });

    if (monitorState.busy) {
        logger.trace(
            {
                previousRerunRequested: monitorState.rerunRequested,
            },
            'Monitor is busy, setting rerunRequested flag',
        );
        monitorState.rerunRequested = true;
        return;
    }

    monitorState.busy = true;

    try {
        do {
            monitorState.rerunRequested = false;

            const guild = await container.utilities.guild.getOrThrow();

            const nextEligibleAuxMemberIds = await getEligibleAuxMemberIds({ guild });
            monitorState.eligibleMemberDiscordUserIds = nextEligibleAuxMemberIds;

            if (nextEligibleAuxMemberIds.size === 0) {
                logger.trace(
                    {},
                    'No eligible AUX members in voice channels',
                );
                continue;
            }

            const trackedAuxMembers: { discordUserId: string; discordUsername: string }[] = [];
            for (const eligibleMemberDiscordUserId of monitorState.eligibleMemberDiscordUserIds) {
                const member = await container.utilities.member.getOrThrow({
                    discordUserId: eligibleMemberDiscordUserId,
                }).catch(() => null);
                trackedAuxMembers.push({
                    discordUserId: eligibleMemberDiscordUserId,
                    discordUsername: member?.user.username ?? "Unknown"
                });
            }

            logger.trace(
                {
                    trackedAuxMembers,
                },
                'Tracked eligible AUX members',
            );
        } while (monitorState.rerunRequested);
    } finally {
        monitorState.busy = false;
    }
}
