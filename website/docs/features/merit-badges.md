---
title: Merit Badges
sidebar_position: 6
---

# Merit Badges

Merit badges show a member's merit standing as a Discord role with a badge icon. Each member with at least 1 merit holds exactly one of 36 badge roles: 12 levels, each with sections I, II and III. The badge is a lookup of the member's current merit total. Arbiter stores no badges and never changes a merit to move a badge.

:::info When enabled

Badges are off until an operator sets the badge role ID variables, and the production cutover has not run yet. Until then, members see no badge roles and every merit message keeps the legacy rank-level copy. The circled rank number (①–㊿) stays in nicknames until a later release removes it. The [rollout runbook](../operations/merit-badge-rollout.md) is the cutover procedure.

:::

## The Ladder

A member's badge is the highest floor at or below their current total. The top badge, Supra Omnia III, starts at 2,000 merits.

| Level | Name        | I     | II    | III   |
| ----- | ----------- | ----- | ----- | ----- |
| 1     | Ferrum      | 1     | 2     | 3     |
| 2     | Aes         | 5     | 8     | 11    |
| 3     | Argentum    | 16    | 21    | 27    |
| 4     | Aurum       | 35    | 43    | 53    |
| 5     | Smaragdus   | 64    | 80    | 96    |
| 6     | Sapphirus   | 120   | 144   | 171   |
| 7     | Amethystus  | 200   | 232   | 267   |
| 8     | Adamas      | 307   | 347   | 387   |
| 9     | Obsianus    | 427   | 480   | 533   |
| 10    | Sanguis     | 613   | 693   | 800   |
| 11    | Aquila      | 933   | 1,093 | 1,280 |
| 12    | Supra Omnia | 1,493 | 1,733 | 2,000 |

- Badges follow the current total. A demerit can move a member down a section; no peak is stored.
- A total below 1 has no badge, and Arbiter removes any badge role the member holds.
- Every non-bot member with at least 1 merit gets a badge, including staff, Initiates, Ambassadors and the server owner.
- The floors live in `packages/domain/src/meritBadge.ts`. They change only through a reviewed code change, which moves members between badges and never changes merits. This ladder is separate from the frozen 50-level rank policy that API v1 `rankLevel` and `rankSymbol` still use.

## Where Members See A Badge

Next to a member's name in chat, Discord shows the icon of their highest role that has one. Badge roles sit below every staff and moderation role, so:

- **Members** see their badge icon next to their name in chat and in their profile's role list.
- **Staff** keep their staff icon next to their name. Their badge shows in their profile's role list, not beside their name.
- **Compact mode** hides role icons in chat for the viewer who turns it on. The badge still shows in profiles.
- **Server Boost Level 2** is required for role icons. If the server drops below Level 2, Discord hides every role icon. There is no rank-number fallback once the number is removed from nicknames: the badge role stays on the member, but its icon is hidden until the boost level returns.

The badge art is temporary. The admin swaps in final art by changing each role's icon in Discord. No code or configuration changes.

## When Arbiter Updates A Badge

Arbiter adds the member's new badge role and removes any other badge role they hold. It never creates, edits, reorders or deletes roles. Every badge update runs after the merit write has committed, and a badge failure never undoes or blocks the merit.

| Trigger                                           | What happens                                                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Manual merit award or demerit                     | The recipient's badge is synced from the new total. If the role update fails, the staff reply adds "Merit badge role could not be updated. The merit was still applied." |
| Event finalized with merits                       | Each awarded member is synced, one at a time, after the review messages post. See [Event And Merit Workflows](./event-system.md#review-and-finalization).                |
| Someone edits a badge role by hand                | The member-update listener puts the right badge back. A badge-only change skips division reconciliation and the nickname.                                                |
| A member rejoins                                  | Their badge is restored from their stored total. The welcome message still posts if the badge sync fails.                                                                |
| `/staff user_migrate`                             | Badge roles are not copied from the old account. Arbiter syncs the new account's badge, then the old account's.                                                          |
| `/staff merit_badges sync`                        | Staff reconcile every member, or one member. Dry run by default. See [Merit Badge Sync Command](./division-and-membership.md#merit-badge-sync-command).                  |
| `/dev sync_guild_members` (development mode only) | Each member's badge is synced along with the member sync. The summary shows "Badges Updated" and "Badge Failures".                                                       |

Every sync for one member runs inside a shared per-member lock. Listener, event-finalize and bulk syncs re-read the total from Postgres inside that lock; a manual award uses the total its own write just produced. A member who already holds the right badge costs zero Discord calls.

## What Members And Staff Read

Once a member's current badge has a role:

- **Badge DM.** A member gets one DM for every new badge, not only for a new level: "You've earned the **Ferrum II** merit badge!" The last line names the next badge, for example "Next badge **Aes I** in **2 merits**". A demerit sends no DM, and the bulk sync never sends DMs.
- **`/merit list`** shows "Current Badge" and "Badge Progress".
- **Next badge without a role.** If the next badge has no role yet, the DM and `/merit list` keep the legacy "Next rank level" wording and never name the missing badge.

`/merit rank_list` keeps the legacy 50-level table until all 36 badge role IDs are set and the bot restarts. Then it lists how many members hold each badge, by division, 9 rows a page.

## The Admin's Part

The server admin (Zer0grav, for Even Legion's servers) owns the roles. Arbiter only adds and removes them on members. For each server:

1. Confirm Server Boost Level 2 and at least 36 free role slots (Discord allows 250 roles a server).
2. Create the 36 roles. Name each after its badge, for example "Adamas I".
3. Upload the badge image as each role's icon. Discord accepts PNG or JPG; 64×64 PNG is the plan's format.
4. Give the roles no permissions.
5. Order them below Arbiter's highest role, below every staff and moderation role, and above other members' icon roles.
6. Send the 36 role IDs to whoever deploys Arbiter, labelled with their badge.

Arbiter checks the roles each time the bot starts and on every sync dry run. It reports a role ID that is missing from the server, a badge role that is not below Arbiter's highest role, the lowest staff role or the lowest moderation role, and a badge role with moderation permissions. The check reports; it never edits a role.

## Configuration

Arbiter reads one optional environment variable per tier. They follow the same pattern as the other `*_ROLE_ID` variables, and `.env.example` lists them in ladder order.

- **Off by default.** There is no feature flag. With every variable unset or empty, badge sync is off. Setting a variable turns sync on for that tier; unsetting it turns that tier off.
- **Real IDs only.** A tier's variable stays unset until its real role exists in that server. A placeholder ID in a running bot turns sync on for that tier, and every add of it then fails with Discord error 10011 (unknown role). Placeholder IDs belong only in `.env.example` and tests.
- **Bad values stop startup.** The bot refuses to start if a value is not a Discord ID (17 to 20 digits), if two tiers share an ID, if a badge ID reuses another `*_ROLE_ID` value such as a division role, or if a `MERIT_BADGE_*_ROLE_ID` variable names no tier.
- **Partial setups work.** A member whose tier has no role gets the highest configured badge below it, and the sync dry run counts them as `unconfigured`. Set all 36 together in production: member copy and `/merit rank_list` switch over cleanly only then.
- **Restart to apply.** The bot reads these variables at startup. Recreate the bot after any change.

| Tier | Badge           | Floor | Variable                              |
| ---- | --------------- | ----- | ------------------------------------- |
| 1    | Ferrum I        | 1     | `MERIT_BADGE_FERRUM_I_ROLE_ID`        |
| 2    | Ferrum II       | 2     | `MERIT_BADGE_FERRUM_II_ROLE_ID`       |
| 3    | Ferrum III      | 3     | `MERIT_BADGE_FERRUM_III_ROLE_ID`      |
| 4    | Aes I           | 5     | `MERIT_BADGE_AES_I_ROLE_ID`           |
| 5    | Aes II          | 8     | `MERIT_BADGE_AES_II_ROLE_ID`          |
| 6    | Aes III         | 11    | `MERIT_BADGE_AES_III_ROLE_ID`         |
| 7    | Argentum I      | 16    | `MERIT_BADGE_ARGENTUM_I_ROLE_ID`      |
| 8    | Argentum II     | 21    | `MERIT_BADGE_ARGENTUM_II_ROLE_ID`     |
| 9    | Argentum III    | 27    | `MERIT_BADGE_ARGENTUM_III_ROLE_ID`    |
| 10   | Aurum I         | 35    | `MERIT_BADGE_AURUM_I_ROLE_ID`         |
| 11   | Aurum II        | 43    | `MERIT_BADGE_AURUM_II_ROLE_ID`        |
| 12   | Aurum III       | 53    | `MERIT_BADGE_AURUM_III_ROLE_ID`       |
| 13   | Smaragdus I     | 64    | `MERIT_BADGE_SMARAGDUS_I_ROLE_ID`     |
| 14   | Smaragdus II    | 80    | `MERIT_BADGE_SMARAGDUS_II_ROLE_ID`    |
| 15   | Smaragdus III   | 96    | `MERIT_BADGE_SMARAGDUS_III_ROLE_ID`   |
| 16   | Sapphirus I     | 120   | `MERIT_BADGE_SAPPHIRUS_I_ROLE_ID`     |
| 17   | Sapphirus II    | 144   | `MERIT_BADGE_SAPPHIRUS_II_ROLE_ID`    |
| 18   | Sapphirus III   | 171   | `MERIT_BADGE_SAPPHIRUS_III_ROLE_ID`   |
| 19   | Amethystus I    | 200   | `MERIT_BADGE_AMETHYSTUS_I_ROLE_ID`    |
| 20   | Amethystus II   | 232   | `MERIT_BADGE_AMETHYSTUS_II_ROLE_ID`   |
| 21   | Amethystus III  | 267   | `MERIT_BADGE_AMETHYSTUS_III_ROLE_ID`  |
| 22   | Adamas I        | 307   | `MERIT_BADGE_ADAMAS_I_ROLE_ID`        |
| 23   | Adamas II       | 347   | `MERIT_BADGE_ADAMAS_II_ROLE_ID`       |
| 24   | Adamas III      | 387   | `MERIT_BADGE_ADAMAS_III_ROLE_ID`      |
| 25   | Obsianus I      | 427   | `MERIT_BADGE_OBSIANUS_I_ROLE_ID`      |
| 26   | Obsianus II     | 480   | `MERIT_BADGE_OBSIANUS_II_ROLE_ID`     |
| 27   | Obsianus III    | 533   | `MERIT_BADGE_OBSIANUS_III_ROLE_ID`    |
| 28   | Sanguis I       | 613   | `MERIT_BADGE_SANGUIS_I_ROLE_ID`       |
| 29   | Sanguis II      | 693   | `MERIT_BADGE_SANGUIS_II_ROLE_ID`      |
| 30   | Sanguis III     | 800   | `MERIT_BADGE_SANGUIS_III_ROLE_ID`     |
| 31   | Aquila I        | 933   | `MERIT_BADGE_AQUILA_I_ROLE_ID`        |
| 32   | Aquila II       | 1,093 | `MERIT_BADGE_AQUILA_II_ROLE_ID`       |
| 33   | Aquila III      | 1,280 | `MERIT_BADGE_AQUILA_III_ROLE_ID`      |
| 34   | Supra Omnia I   | 1,493 | `MERIT_BADGE_SUPRA_OMNIA_I_ROLE_ID`   |
| 35   | Supra Omnia II  | 1,733 | `MERIT_BADGE_SUPRA_OMNIA_II_ROLE_ID`  |
| 36   | Supra Omnia III | 2,000 | `MERIT_BADGE_SUPRA_OMNIA_III_ROLE_ID` |

Turning badge sync off does not remove badge roles members already hold. To remove them all, the admin deletes the badge roles in Discord. Merit data is never touched.

## Retiring The Rank Number

The circled number in nicknames is removed permanently in a later release, after badges have run live for at least 7 days and 2 finalized events. Arbiter keeps recognizing and stripping the old ①–㊿ symbols, so name-change requests and nickname cleanup still work. This page and the nickname guidance change when that release lands.

## Logs

Badge log lines carry Discord IDs, tier numbers and role IDs, never names or totals.

| Log message                                                  | Meaning                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `merit_badge.role_check.completed` / `.issue`                | Startup or dry-run role check result, and one warning per problem                                       |
| `merit_badge.sync.completed` / `.failed`                     | One member's sync. A failure has a `stage` and a `code` such as `missing_permissions` or `unknown_role` |
| `merit_badge.sync.tier_role_missing`                         | The member's tier has no role yet; the highest configured tier below it was used                        |
| `event.review.merit_badge_sync.completed`                    | Badge sync after an event finalize, with member, update and failure counts and `durationMs`             |
| `merit_badge.bulk_sync.dry_run_completed`                    | Sync dry run: counts only                                                                               |
| `merit_badge.bulk_sync.completed` / `.completed_with_issues` | Live sync run: counts only                                                                              |
| `merit_badge.bulk_sync.rate_limited`                         | A Discord rate-limit wait during a live run                                                             |
| `Badge-only guild member update: ...` (debug)                | A role change that touched only badge roles; reconciliation and nickname were skipped                   |

## Where The Code Lives

| Concern                           | Location                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------- |
| Ladder and floors                 | `packages/domain/src/meritBadge.ts`                                           |
| Role ID variables                 | `src/config/meritBadgeRoles.ts`, `src/config/env/discord.ts`                  |
| Single-member sync and role check | `src/lib/services/merit-badge`                                                |
| Bulk sync command                 | `src/lib/features/staff/merit-badges`                                         |
| Badge copy (DMs, list, rank list) | `src/lib/services/merit-rank/meritBadgeMessages.ts`, `src/lib/features/merit` |
