## v3.3.0 - 2026-04-30

### Features
- Added new staff command for listing number of org members per merit rank level, broken down by discord roles by @Spacesai1or in [#79](https://github.com/EvenLegion/Arbiter/pull/79)
- Add /staff medal_give to award Medal: roles for recent events, letting staff give a medal to all merit-approved attendees after an event is submitted with merits or to a specific attendee/user, with automatic recipient DMs and safeguards against awarding all attendees when merits were not granted by @Spacesai1or in [#81](https://github.com/EvenLegion/Arbiter/pull/81)
- Add /staff org_accept to give new org members the INT role, and sync their Star Citizen and Discord nicknames by @Spacesai1or in [#82](https://github.com/EvenLegion/Arbiter/pull/82)
- Add /staff update_nickname cmd to update a user's DB stored nickname and sync it in Discord by @Spacesai1or in [#82](https://github.com/EvenLegion/Arbiter/pull/82)
- Add /staff user_migrate and /staff user_purge to move a member’s Arbiter history to a replacement Discord account, copy their roles, merge overlapping records safely, resync the new nickname, and delete the old account record once all references have been cleared by @Spacesai1or in [#83](https://github.com/EvenLegion/Arbiter/pull/83)

### Fixes
- /event start tier selection so typed numbers map to the intended tier by @Spacesai1or in [#80](https://github.com/EvenLegion/Arbiter/pull/80)
