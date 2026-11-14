---
title: Temporary IAE Event Recovery
---

# Temporary IAE Event Recovery

This incident-specific command is restricted to staff in the configured guild
and event **1011**. It is not a general retry mechanism. This runbook describes
production actions but does not authorize a release, VPS command, Discord
invocation, or award. Obtain approval before each production stage.

## Before deployment

Prepare the reviewed isolated hotfix from the confirmed production revision,
then deploy only the affected bot revision. Do not promote `dev`: it contains
unreleased merit and nickname changes outside this incident. Confirm the actual
deployed source revision before treating the main release as the production
base. Hotfix publication is separate from deployment and requires its own
approval. No schema migration is added by this fix. Follow the normal deployment runbook
for backup and migration-history verification; do not restart Redis or the API
as a side effect. The bot registers `/debug recover_iae_event` on startup.

The command requires the original incident snapshot, mounted read-only at:

```text
/app/recovery/event-1011-20261114T005813225334Z.json
```

Its pinned SHA-256 is:

```text
f92db3c2fbbab8f1f8ec02beb1bd46055c94bd8c441340eaaffc5a5b8c7cd17d
```

Keep the original preserved. Do not paste participant data into source control,
logs, or Discord. Use an approved temporary Compose override with a read-only
single-file bind and `create_host_path: false`, preserving the existing log
mount. Verify the bot's configured numeric UID can read the file without
broadening permissions unnecessarily. A missing or different file blocks the
command; it cannot accept arbitrary paths, events, or attendance.

## Discord steps

1. Run `/debug recover_iae_event` (or `apply:false`) for a read-only preflight.
   It checks the exact snapshot, event identity and timing, all 75 current user
   mappings, stopped Redis attendance, database state, bot permissions, and
   complete thread history. It creates no operation lock or event data.
2. Review the dry-run result before explicitly running
   `/debug recover_iae_event apply:true`.
3. Verify the success result and the normal **Event Merit Review** embed in the
   event thread. Keep the existing Event Tracking Summary, draft, start, and end
   messages; these are distinct from the review embed.

Apply mode takes the existing event-operation lock and atomically writes the
75 attendance rows and 75 default `MERIT` review decisions. These are decisions,
**not awarded merits**. Every participant met the confirmed 252-second threshold
for the 504-second event. It then posts the ordinary paginated review interface
or adopts an already verified matching bot review message, and records its
reference. It does not finalize the event, award merits or medals, delete Redis
attendance, change event times, or delete the snapshot.

A rerun accepts only unchanged, exact completed data. It never overwrites staff
review choices or repairs arbitrary partial/conflicting state. The command stops
if the event was finalized, merits already exist, attendance changed, history
cannot be fully read within 2,000 messages, or multiple reviews exist.

## Failures and follow-up

A database commit and a Discord message cannot be one atomic transaction. A
presentation failure can leave all 75 rows safely persisted, or a message posted
without its database reference. The command never blindly retries a send in the
same invocation. Before another attempt, inspect the request ID and recovery
phase in the logs, then use the dry run to reconcile full thread history. A
matching orphan message is adopted instead of reposted. A stable Discord nonce
adds recent-send deduplication; it is not a permanent cross-system guarantee.

The command exposes the normal review controls. Staff should not edit or finalize
while recovery is running. After verified recovery, ordinary review/finalization
and medal giving are **separate authorized actions**. Remove the temporary
command, its service/adapters/tests, and the deployment mount in a follow-up
change; retain the incident snapshot according to the owner's retention policy.
