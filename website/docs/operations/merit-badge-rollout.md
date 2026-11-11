---
title: Merit Badge Rollout
sidebar_position: 12
---

# Merit Badge Rollout

This runbook turns [merit badges](../features/merit-badges.md) on in production, backfills every member, and then removes the circled rank number from nicknames. It describes the procedure; it does not authorize it. Every live step needs explicit approval at the time it runs, and the [release and operations approval boundary](./release-and-deploy.md#approval-boundary) applies throughout.

## Ground Rules

- **Test server first.** Every Discord step runs on the test server before production. Never point a test build at the production server, and never put test role IDs in a production environment.
- **Merits are never touched.** No step adds, edits or deletes a merit, changes a merit type's amount, or re-seeds merit types. A rollback removes badge roles, never merit data.
- **Arbiter never manages roles.** The admin creates, names, orders and deletes badge roles. Arbiter only adds and removes them on members.
- **Role IDs are the switch.** There is no feature flag. Setting the 36 `MERIT_BADGE_<TIER>_ROLE_ID` variables and recreating the bot turns badges on; unsetting them and recreating the bot turns badge writes off.
- **The number goes last.** The release that removes the rank number from nicknames stays unmerged until step 9 is approved. Any release after it merges starts stripping numbers.
- **Record evidence.** Keep the evidence for each step in the cutover ticket: who approved it, when it ran, the revision or role IDs involved, the command replies, and request IDs. Do not record tokens or raw environment files.

## Who Does What

| Role                  | Part                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Admin (Zer0grav)      | Creates and orders the 36 roles on each server, uploads the icons, sends the role IDs, deletes the roles for a full removal. |
| Operator              | Releases and deploys Arbiter, sets the role ID variables, recreates the bot, watches the logs.                               |
| Staff (EXEC and TECH) | Runs the sync commands, reviews the cutover report, makes the go or no-go call at step 6.                                    |
| Project owner         | Approves each live step and posts the announcement at step 11. An agent never posts it.                                      |

## Before You Start

- The badge work is merged to `dev`: badge policy, role ID configuration, single-member sync, sync hooks, `/staff user_migrate` role handling, `/staff merit_badges sync`, badge copy, and the `/staff sync_nickname` dry run.
- This runbook and the [merit badges](../features/merit-badges.md) page are merged before step 4.
- The rank-number removal is implemented and validated, with its PR ready but **unmerged**.
- You know the two commands that differ in their default:
    - `/staff merit_badges sync` is a **dry run** unless you pass `dry_run: false`.
    - `/staff sync_nickname` is a **live run** unless you pass `dry_run: true`.

## Steps At A Glance

| #   | Step                              | Gate                                                      | Rollback                                                               |
| --- | --------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | Confirm prerequisites             | Read-only                                                 | None needed                                                            |
| 2   | Create and order the roles        | Live Discord change by the admin                          | Delete or move the roles; Arbiter has not touched them                 |
| 3   | Rehearse on the test server       | Test-server deploy and live changes on the test server    | Unset the test variables, recreate the test bot, delete the test roles |
| 4   | Release and deploy the badge code | Release publication and production deploy                 | Revert the bot image                                                   |
| 5   | Set the production role IDs       | Configuration change and bot recreate                     | Unset the variables and recreate the bot                               |
| 6   | Review the cutover report         | Read-only go or no-go by EXEC and TECH                    | None needed                                                            |
| 7   | Canary one member                 | Live single-member change                                 | Step 5 rollback                                                        |
| 8   | Backfill every member             | Live bulk role change                                     | Step 5 rollback, then the admin deletes the roles for a full removal   |
| 9   | Observe                           | Read-only                                                 | None needed                                                            |
| 10  | Remove the rank number            | Release publication, production deploy and bulk nicknames | Redeploy the previous image and rerun the nickname sync                |
| 11  | Announce                          | Project owner posts                                       | Follow-up post                                                         |

## Step 1: Confirm Prerequisites

Read-only, on both the test server and production:

- [ ] Server Boost Level 2 (7 or more boosts). Record the boost count and how many boosts the server can lose before it drops below Level 2. Below Level 2, Discord hides every role icon.
- [ ] At least 36 free role slots. Discord allows 250 roles a server.
- [ ] Arbiter's highest role position, and that Arbiter has Manage Roles.
- [ ] The lowest staff role and the lowest role with moderation permissions. Badge roles must sit below both, and below Arbiter's highest role.

## Step 2: Create And Order The Roles

The admin does this on the test server first, then on production. See [the admin's part](../features/merit-badges.md#the-admins-part) for the full list.

- [ ] 36 roles named after their badges, Ferrum I to Supra Omnia III.
- [ ] Each badge image uploaded as the role icon (64×64 PNG).
- [ ] No permissions on any badge role.
- [ ] Ordered below every staff and moderation role and below Arbiter's highest role, above other members' icon roles.
- [ ] The 36 role IDs for each server, labelled with their badge, sent to the operator.

Keep the two servers' IDs apart. A production variable set to a test-server ID fails every add with "unknown role".

**Rollback:** the admin deletes or moves the roles. Arbiter has not used them yet.

## Step 3: Rehearse On The Test Server

Run a test bot from the revision you plan to release, against the test server only, with the test server's 36 role IDs in its environment. Use a test member with a known merit total and a staff account that can run `/merit give` and edit roles. Set the bot's log level to debug for this step so badge-only updates are visible.

### Start-up and hierarchy

- [ ] The bot starts. `merit_badge.role_check.completed` shows `configuredTierCount` 36 and `issueCount` 0.
- [ ] Arbiter's role sits above the badge roles and has Manage Roles.

### Single-member sync

- [ ] **Manual award:** `/merit give` enough merits to reach a badge. The member gets exactly one badge role, and the staff reply has no badge warning line.
- [ ] **Demerit:** a demerit that drops the member below that floor moves the badge down one section, or removes it under 1 merit.
- [ ] **Event finalize:** run a short event and finalize it with merits. Each awarded member ends with the right single badge. Record `durationMs` from `event.review.merit_badge_sync.completed`.
- [ ] **Hand removal is repaired:** remove the member's badge role by hand. The bot puts it back within a few seconds. Repeat within 60 seconds of the bot's own badge change; it must still come back.
- [ ] **Wrong badge is repaired:** give the member a different badge role by hand. The bot removes it and keeps the right one.
- [ ] **Badge-only changes skip other work:** during the two repairs above, the nickname and division roles do not change, and the log shows "Badge-only guild member update".
- [ ] **Division change still works:** add or remove a division role. Membership and nickname update as before, and the badge stays correct.
- [ ] **Rejoin:** the test member leaves and rejoins. They get their badge back, and the welcome message still posts.
- [ ] **Permission failure is reported, not fatal:** move Arbiter's role below a badge role, then give a manual award. The merit is saved and the reply says "Merit badge role could not be updated. The merit was still applied." Move Arbiter's role back.
- [ ] **Dev sync** (development mode only): `/dev sync_guild_members` shows "Badges Updated" and "Badge Failures", with 0 failures.

### `/staff merit_badges sync`

- [ ] **Registration:** the command shows `user` (autocomplete) and `dry_run`. A non-staff account cannot run it.
- [ ] **Dry run with no role IDs:** clear the badge variables, recreate the bot, run with no options. The reply is ephemeral, says nothing was changed, shows the histogram, the action counts and "Role hierarchy check: Not run", and attaches `merit-badge-dry-run.csv`. In a spreadsheet the CSV has IDs and stored usernames only, the legacy symbol reads correctly, and no cell runs as a formula. No roles changed.
- [ ] **Dry run, then live:** set the variables again and recreate the bot. Run the dry run, then `dry_run: false`. The live Updated count matches the dry run's add, swap and remove counts.
- [ ] **Rerun converges:** run `dry_run: false` again. Updated 0, Failed 0, and the log shows no role calls.
- [ ] **Run lock:** while a live run is going, a second live run from another staff account is refused with "already running".
- [ ] **Not ready:** move one badge role above Arbiter's role and run `dry_run: false`. It stops before any change and names the badge. Move the role back.
- [ ] **Single user:** `user` set and `dry_run: false` for a member with a wrong badge changes only that member.
- [ ] **Pacing:** record the run time and any `merit_badge.bulk_sync.rate_limited` lines. If there are none, `MERIT_BADGE_BULK_PACE_MS` (1 second, in `src/lib/services/merit-badge/meritBadgeBulkSyncService.ts`) can be lowered by a reviewed code change before production. Record the decision.

### Badge copy

- [ ] **Badge DM:** an award that moves the member to a new section sends one DM, "You've earned the **Ferrum II** merit badge!", with the next badge line. An award inside the same section sends no badge DM; a demerit sends none.
- [ ] **Manual award DM:** the last line names the next badge, for example "Next badge **Aes I** in **2 merits**".
- [ ] **Next badge without a role:** with only some roles set, a member whose next badge has no role keeps the old "Next rank level" wording and never sees the missing badge named.
- [ ] **`/merit list`** shows "Current Badge" and "Badge Progress".
- [ ] **`/merit rank_list`:** with fewer than 36 roles set, it keeps the old description and the 50-level table. With all 36 set and the bot recreated, it reads "List how many members hold each merit badge, by division (staff only).", shows "Merit Badge List (Ferrum-Argentum)", 9 rows a page, 4 pages, and Next and Prev work. A page 5 button from an old legacy list opens page 4.
- [ ] **No role IDs:** with the variables cleared, DMs, `/merit list` and `rank_list` show the old level copy.

### `/staff sync_nickname` dry run

- [ ] **Registration:** the command shows `user`, `include_staff` and `dry_run`.
- [ ] **Dry run changes nothing:** change a test member's nickname by hand, then run with `dry_run: true`. The ephemeral reply is titled "Nickname Sync Dry Run", shows "Would Update", lists the hand-edited name as `current → planned`, and attaches `nickname-sync-dry-run.csv`. No nickname changed.
- [ ] **Staff:** without `include_staff`, staff appear in the CSV as `skipped_staff`; with `include_staff: true`, they appear as changes when their nickname differs.
- [ ] **Matches live:** run again without `dry_run`. "Updated" equals the dry run's "Would Update", and a second dry run then shows 0 to update.
- [ ] **Logs:** `nickname.sync.dry_run_completed` has counts only, no nicknames.

### Client check

- [ ] The badge icon shows on desktop, web, iOS and Android, in light and dark themes, next to the name in Cozy chat and in the profile.
- [ ] A staff test account shows the staff icon beside the name and the badge in the profile.

### Close out the rehearsal

- [ ] Note any failure on the ticket for the code that failed, and fix it before step 4.
- [ ] Remove the test role IDs from any environment that will deploy before the real roles exist.

**Rollback:** unset the test variables, recreate the test bot, and have the admin delete the test roles if wanted.

## Step 4: Release And Deploy The Badge Code

Publish the source release from `dev` and deploy the bot. See [source publication](../contributing/release-process.md#source-publication-path) and [normal update](./production-deployment.md#normal-update).

- [ ] The production environment has **no** `MERIT_BADGE_*_ROLE_ID` value set, so every badge feature stays off.
- [ ] The badge work adds no schema migration and no API change, and its release plans are internal, so the public release notes do not mention badges. Follow the normal update path for anything else the release contains, including `arbiter-migrate` and any API rollout.
- [ ] Recreate `arbiter-bot` and complete its [minimum verification](./production-deployment.md#minimum-verification).
- [ ] No `merit_badge.role_check` line appears at startup, because no role is configured.
- [ ] `/staff merit_badges sync` and the `dry_run` option of `/staff sync_nickname` are registered.

**Rollback:** redeploy the retained bot image.

## Step 5: Set The Production Role IDs

Set the 36 variables in the bot's production `.env` to the production role IDs from step 2, then recreate the bot. The [configuration table](../features/merit-badges.md#configuration) lists every variable with its badge.

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate \
  arbiter-bot
```

- [ ] Every value is a real production role ID. No placeholder, no test-server ID, no blank among the 36.
- [ ] The bot starts. A bad value stops startup with "Invalid environment configuration" and names the variable.
- [ ] `merit_badge.role_check.completed` shows `configuredTierCount` 36 and `issueCount` 0, with no `merit_badge.role_check.issue` warnings.

From here, any merit award, demerit, finalized event, role change or rejoin also updates that member's badge, and badge DMs start. Members not touched yet keep no badge until step 8.

**Rollback:** unset the 36 variables and recreate the bot. Badge writes stop. Roles already added stay on members until the admin deletes the badge roles.

## Step 6: Review The Cutover Report

Run `/staff merit_badges sync` with no options (a dry run). It changes nothing.

- [ ] The histogram has no surprises. The top member is at the expected badge (599 merits was Obsianus III at plan time).
- [ ] Spot-check five members: each CSV row's earned badge matches the member's total in `/merit list` and the [ladder](../features/merit-badges.md#the-ladder).
- [ ] The action counts make sense: before the backfill, most members with merits are `add`; `unconfigured` is 0.
- [ ] "Role hierarchy check" reports no problems in 36 configured badge roles.
- [ ] EXEC and TECH record a go or no-go.

## Step 7: Canary One Member

Run `/staff merit_badges sync` with `user` set to one member and `dry_run: false`.

- [ ] Only that member changed, and they hold exactly one badge role.
- [ ] The icon shows in Cozy chat and in the profile, in light and dark themes, on desktop, web, iOS and Android.
- [ ] A staff canary shows the staff icon beside their name and the badge in their profile.
- [ ] Removing the canary's badge by hand is undone within a few seconds.

If mobile clients do not show the icon, stop here and use the step 5 rollback.

## Step 8: Backfill Every Member

Run `/staff merit_badges sync` with `dry_run: false` and no `user`. One live run at a time.

- [ ] A run that cannot finish stops by itself after about 12 minutes, or after 3 long Discord rate-limit waits. Its reply shows processed, remaining, updated, failed and rate-limit counts. Run it again until it completes with **Updated 0 and Failed 0**. Members who already have the right badge cost no Discord calls, so reruns are cheap.
- [ ] After each run, watch guild member update volume in the Grafana logs dashboard return to its baseline before the next run.
- [ ] If a run reports failures, look up its request ID before rerunning. `missing_permissions` means a role order or permission problem; `unknown_role` means a wrong role ID (step 5 rollback, then fix the ID).
- [ ] Finish with a dry run: every action count except `none` is 0.

The bulk sync never sends DMs.

**Rollback:** the step 5 rollback, then the admin deletes the badge roles if a full removal is wanted. Merit data is never touched.

## Step 9: Observe

Wait at least **7 days and 2 finalized events** after the backfill.

- [ ] Run a sync dry run each day. Drift is 0: every action count except `none` is 0.
- [ ] After each finalized event, `event.review.merit_badge_sync.completed` shows 0 failures.
- [ ] No unexpected `merit_badge.sync.failed` lines.
- [ ] The project owner approves moving to step 10.

## Step 10: Remove The Rank Number

Only after step 9 is approved:

1. Merge the rank-number removal into `dev`, publish the release, and deploy the bot as in step 4.
2. Run `/staff sync_nickname` with `dry_run: true` and `include_staff: true`. Review every row in the CSV, including staff rows.
3. Use `/staff update_nickname` first for any staff member who should not take the other computed changes the sync would make.
4. Run `/staff sync_nickname` with `include_staff: true` (live).
5. A second dry run with `include_staff: true` shows 0 to update.

- [ ] No nickname shows a circled number.
- [ ] A name-change request containing an old ①–㊿ symbol is still stripped or rejected as before.

**Rollback:** redeploy the previous bot image and rerun `/staff sync_nickname` with `include_staff: true` to restore the numbers.

## Step 11: Announce

The project owner posts the badge ladder and how to read it. An agent never sends this post. If something in it is wrong, correct it with a follow-up post.

## Watching The Logs

In Grafana Explore, against Loki, these queries show the badge work. Badge lines carry Discord IDs, tier numbers and role IDs, never names or totals.

```logql
{app="arbiter", service="bot"} | json | msg=~"(merit_badge|event\\.review\\.merit_badge).*"
```

```logql
{app="arbiter", service="bot"} | json | msg=~"merit_badge\\.(sync\\.failed|bulk_sync\\.rate_limited|role_check\\.issue)"
```

To follow one command run, filter the **Request ID Trace** panel of the Arbiter logs dashboard by the request ID from the command's reply. The [merit badges](../features/merit-badges.md#logs) page lists every badge log message.
