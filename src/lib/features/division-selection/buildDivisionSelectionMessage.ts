import type {
    APIActionRowComponent,
    APIButtonComponent,
    APIEmbed,
} from 'discord.js';
import { type Division, DivisionKind } from '@prisma/client';

import { ENV_DISCORD } from '../../../config/env/discord';

type DivisionSelectionMessage = {
    embeds: APIEmbed[];
    components: APIActionRowComponent<APIButtonComponent>[];
};

type BuildDivisionSelectionMessageParams = {
    divisions: Division[];
};

const COMBAT_DISPLAY_COLOR = 0x3b82f6;
const INDUSTRIAL_DISPLAY_COLOR = 0x22c55e;
const UNIFORMS_URL = 'https://www.evenlegion.space/uniforms';

const SELECTABLE_DIVISIONS = {
    COMBAT: {
        HLO: [
            "**High-Altitude Lethal Overwatch** - H.A.L.O. is Even Legion's elite fighter squadron. These pilots dominate the skies through fierce engagement and superior air control, ensuring aerial superiority in every conflict.",
            '\nIn this Division, you might: fly high-speed fighters/interceptors, engage enemy squadrons, or serve as air cover in coordinated ops.',
        ],
        VNG: [
            "**Vehicle & Ground Unity Armed Deployment** - V.A.N.G.U.A.R.D. is the Legion's ground combat core. Vanguard leads bunker breaches, vehicle assaults, and frontline raids. Whether it's boots in the dirt or tanks on the move, they're our hammer on the ground.",
            '\nIn this Division, you might: clear bunkers, operate tanks or transports, hold fortified positions, and assault, clear, and hold key locations.',
        ],
        HVK: [
            '**Heavy Air Support & Variable Ordnance** - H.A.V.O.K. is our multi-crew gunship and heavy-class strike unit. Operating between air and ground, they bring firepower and flexibility to escort, overwatch, and support combat teams in hostile zones.',
            '\nIn this Division, you might: crew a gunship, escort dropships, take out enemy capital ships, or support divisions on the ground and in the air.',
        ],
    },
    INDUSTRIAL: {
        DRL: [
            '**Deep Resource & Industrial Legion Logistics** - D.R.I.L.L keeps the Legion supplied with raw materials — Quantanium, Laranite, Bexalite, and everything in between. From ROC teams to Mole crews, these operators extract resources and manage refining to maximize profit.',
        ],
        SCR: [
            "**Salvage, Collection, Recovery & Processing** - S.C.R.A.P. reclaims value from the wreckage of war. Whether it's scraping hulls in a Vulture, stripping down derelicts, or hauling back cargo left behind, this Division thrives on turning trash into treasure.",
        ],
        LOG: [
            '**Logistics, Organization, Ground & Interstellar** - L.O.G.I. is the beating heart of organization in the Legion. They transport objectives, cargo, and mission-critical equipment across planets and systems.',
        ],
        TRD: [
            '**Trade, Routes, Acquisition, Distribution & Exchange** - T.R.A.D.E. plays the markets. These pilots know where to buy, where to sell, and how to make credits flow. From high-risk cargo routes to market-savvy exports, T.R.A.D.E. members fly for profit, planning every move for maximum gain.',
        ],
        ARC: [
            '**Advanced Research, Construction & Habilitation** - A.R.C.H. builds the future. Focused on repair, engineering, refuel, infrastructure, and crafting systems as they develop, this Division is for tinkerers, mechanics, and future builders.',
        ],
    }
};

export function buildDivisionSelectionMessage({
    divisions,
}: BuildDivisionSelectionMessageParams): DivisionSelectionMessage {
    const combatEmbed: APIEmbed = {
        title: '⚔️ COMBAT DIVISIONS',
        description: `_Only <@&${ENV_DISCORD.LGN_ROLE_ID}> may select. You may choose **ONE** combat division._\n\n`,
        color: COMBAT_DISPLAY_COLOR,
        fields: [
            { name: '\u200B', value: '', inline: false },
        ],
    };
    const combatButtons: APIButtonComponent[] = [];

    const industrialEmbed: APIEmbed = {
        title: '🛠️ INDUSTRIAL DIVISIONS',
        description: `_Only <@&${ENV_DISCORD.LGN_ROLE_ID}> may select. You may choose **ONE** industrial division._\n\n`,
        color: INDUSTRIAL_DISPLAY_COLOR,
        fields: [
            { name: '\u200B', value: '', inline: false },
        ],
    };
    const industrialButtons: APIButtonComponent[] = [];

    const instructionsEmbed: APIEmbed = {
        title: '📌 DIVISION INSTRUCTIONS',
        description: [
            '✅ Click a division button to join your division.',
            '',
            '🔄 Click a different division button to switch divisions.',
            '',
            '❌ Click _Leave Combat_ to leave your combat division.',
            '',
            '❌ Click _Leave Industrial_ to leave your industrial division.',
            '',
            'ℹ️ Click the _View Uniforms_ button to view approved Legion armor sets.',
        ].join('\n'),
    };

    divisions.forEach((division) => {
        if (
            SELECTABLE_DIVISIONS.hasOwnProperty(division.kind) &&
            SELECTABLE_DIVISIONS[division.kind as 'COMBAT' | 'INDUSTRIAL'].hasOwnProperty(division.code)
        ) {
            if (division.kind === DivisionKind.COMBAT) {
                combatEmbed.fields!.push({
                    name: `<:${division.emojiName}:${division.emojiId}> **Division: ${division.name}**`,
                    value: SELECTABLE_DIVISIONS.COMBAT[division.code as 'HLO' | 'VNG' | 'HVK'].join('\n'),
                    inline: false,
                });
                combatEmbed.fields!.push({
                    name: '\u200B',
                    value: '',
                    inline: false,
                });

                combatButtons.push({
                    type: 2,
                    custom_id: `division:join:${division.code}`,
                    label: division.name,
                    style: 1, // PRIMARY (blurple)
                    emoji: {
                        id: division.emojiId ?? undefined,
                        name: division.emojiName ?? undefined,
                    },
                });
            } else {
                industrialEmbed.fields!.push({
                    name: `<:${division.emojiName}:${division.emojiId}> **Division: ${division.name}**`,
                    value: SELECTABLE_DIVISIONS.INDUSTRIAL[division.code as
                        | 'DRL'
                        | 'SCR'
                        | 'LOG'
                        | 'TRD'
                        | 'ARC'
                    ].join('\n'),
                    inline: false,
                });
                industrialEmbed.fields!.push({
                    name: '\u200B',
                    value: '',
                    inline: false,
                });

                industrialButtons.push({
                    type: 2,
                    custom_id: `division:join:${division.code}`,
                    label: division.name,
                    style: 3, // SUCCESS (green)
                    emoji: {
                        id: division.emojiId ?? undefined,
                        name: division.emojiName ?? undefined,
                    },
                });
            }
        }
    });

    return {
        embeds: [combatEmbed, industrialEmbed, instructionsEmbed],
        components: toRowsByGroup(combatButtons, industrialButtons),
    };
}

function toRowsByGroup(
    combatButtons: APIButtonComponent[],
    industrialButtons: APIButtonComponent[],
): APIActionRowComponent<APIButtonComponent>[] {
    const rows: APIActionRowComponent<APIButtonComponent>[] = [];

    if (combatButtons.length > 0) {
        rows.push({ type: 1, components: combatButtons });
    }

    if (industrialButtons.length > 0) {
        rows.push({ type: 1, components: industrialButtons });
    }

    rows.push({
        type: 1,
        components: [
            {
                type: 2,
                style: 5, // LINK
                label: 'View Uniforms',
                url: UNIFORMS_URL,
                emoji: { name: 'ℹ️' },
            },
            {
                type: 2,
                style: 4, // DANGER (red)
                custom_id: 'division:leave:combat',
                label: 'Leave Combat',
            },
            {
                type: 2,
                style: 4, // DANGER (red)
                custom_id: 'division:leave:industrial',
                label: 'Leave Industrial',
            },
        ],
    });

    return rows;
}
