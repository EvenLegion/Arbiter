# Changelog

## v3.3.0 - 2026-04-30

### Features
- Added new staff command for listing number of org members per merit rank level, broken down by discord roles by @Spacesai1or in [#79](https://github.com/EvenLegion/Arbiter/pull/79)
- Add /staff medal_give to award Medal: roles for recent events, letting staff give a medal to all merit-approved attendees after an event is submitted with merits or to a specific attendee/user, with automatic recipient DMs and safeguards against awarding all attendees when merits were not granted by @Spacesai1or in [#81](https://github.com/EvenLegion/Arbiter/pull/81)
- Add /staff org_accept to give new org members the INT role, and sync their Star Citizen and Discord nicknames by @Spacesai1or in [#82](https://github.com/EvenLegion/Arbiter/pull/82)
- Add /staff update_nickname cmd to update a user's DB stored nickname and sync it in Discord by @Spacesai1or in [#82](https://github.com/EvenLegion/Arbiter/pull/82)
- Add /staff user_migrate and /staff user_purge to move a member’s Arbiter history to a replacement Discord account, copy their roles, merge overlapping records safely, resync the new nickname, and delete the old account record once all references have been cleared by @Spacesai1or in [#83](https://github.com/EvenLegion/Arbiter/pull/83)

### Fixes
- /event start tier selection so typed numbers map to the intended tier by @Spacesai1or in [#80](https://github.com/EvenLegion/Arbiter/pull/80)

## v3.2.0 - 2026-03-23

### Fixes
- Award the host of events the Centurion Host Merit by @Spacesai1or in [#63](https://github.com/EvenLegion/Arbiter/pull/63)
- Add support for the Optio (Centurion in Testing) role by @Spacesai1or in [#63](https://github.com/EvenLegion/Arbiter/pull/63)
- Backfill Centurion Host Merits for all hosted events, pre and post Arbiter 2.0 by @Spacesai1or in [#63](https://github.com/EvenLegion/Arbiter/pull/63)

## v3.1.0 - 2026-03-20

### Features
- Post event feedback form after event has ended to tracked event voice channels by @Spacesai1or in [#58](https://github.com/EvenLegion/Arbiter/pull/58)

### Refactors
- Event merit review menu now displays a single button per user, increasing the number of users displayed per page from 4 to 10 by @Spacesai1or in [#59](https://github.com/EvenLegion/Arbiter/pull/59)

### Maintenance
- Remove role select section in server Welcome message by @Spacesai1or in [#60](https://github.com/EvenLegion/Arbiter/pull/60)

## v3.0.0 - 2026-03-20

### Refactors

- Complete overhaul of the codebase, optimizing for future contributors by @Spacesai1or in [#53](https://github.com/EvenLegion/Arbiter/pull/53)
- Replace paid-for logging service with opensource self hosted option, allowing for more detailed logging without usage limits by @Spacesai1or in [#53](https://github.com/EvenLegion/Arbiter/pull/53)

### Maintenance

- Init contributor's doc site explaining how the codebase works, how to get started, and how to release new versions of Arbiter by @Spacesai1or in [#53](https://github.com/EvenLegion/Arbiter/pull/53)

## v2.3.2 - 2026-03-15

### Fixes

- release notes so they include commit summary by @Spacesai1or in [#50](https://github.com/EvenLegion/Arbiter/pull/50)

## v2.3.1 - 2026-03-15

### Fixes

- Add helper for staff nickname prefix hierarchy by @Spacesai1or in [#47](https://github.com/EvenLegion/Arbiter/pull/47)

## v2.3.0 - 2026-03-15

### Features

- Enhance staff roles and divisions with membership commands by @Spacesai1or in [#44](https://github.com/EvenLegion/Arbiter/pull/44)

## v2.2.0 - 2026-03-13

### Features

- feat: Github release now post to a discord channel by @Spacesai1or in [#39](https://github.com/EvenLegion/Arbiter/pull/39)

## v2.1.0 - 2026-03-13

### Features

- Init release workflow with automated patch notes by @Spacesai1or in [#23](https://github.com/EvenLegion/Arbiter/pull/23)
