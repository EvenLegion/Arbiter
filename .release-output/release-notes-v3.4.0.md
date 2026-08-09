## v3.4.0 - 2026-08-09

### Features
- Added a one-time Event Ping button for staff, Centurions, and Optios. After an event starts, authorized hosts can notify the Event Notifications role, and Arbiter prevents the same event from being pinged more than once. by @Spacesai1or in [#101](https://github.com/EvenLegion/Arbiter/pull/101)
- Began building a new Arbiter API that will provide member division and merit-rank information to future tools. by @Spacesai1or in [#102](https://github.com/EvenLegion/Arbiter/pull/102)

### Fixes
- Updated Arbiter's Discord, database, and background-task components to fix known security issues that could make the bot slow down or crash. by @Spacesai1or in [#96](https://github.com/EvenLegion/Arbiter/pull/96)
- Fixed Arbiter's release tools so automated and documented release commands work consistently. by @Spacesai1or in [#99](https://github.com/EvenLegion/Arbiter/pull/99)
- Arbiter now automatically cleans up old background-task records and gives Redis more memory, reducing the chance that event attendance tracking is interrupted during busy periods. by @Spacesai1or in [#100](https://github.com/EvenLegion/Arbiter/pull/100)

### Maintenance
- Improved the instructions and safety checks used by automated coding assistants, helping future Arbiter updates stay focused, documented, and safer to review. by @Spacesai1or in [#95](https://github.com/EvenLegion/Arbiter/pull/95)
- Improved automated code reviews so they focus on meaningful problems and stop after a reasonable number of review rounds, reducing delays from low-value feedback. by @Spacesai1or in [#97](https://github.com/EvenLegion/Arbiter/pull/97)
- Improved the checks run before Arbiter updates are merged, making it more likely that broken or incomplete changes are caught before release. by @Spacesai1or in [#98](https://github.com/EvenLegion/Arbiter/pull/98)
- Added release checks that catch missing, duplicate, or outdated changelog entries before an Arbiter update is approved, making release notes more reliable. by @Spacesai1or in [#99](https://github.com/EvenLegion/Arbiter/pull/99)
