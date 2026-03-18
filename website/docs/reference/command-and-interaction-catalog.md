---
title: Command And Interaction Catalog
sidebar_position: 1
---

# Command And Interaction Catalog

Use this page when you need to answer:

- what user-facing entrypoints exist?
- where does a command or interaction route?
- which service owns the workflow?

## Slash Commands

| Surface                            | Handler                                                                           | Main service or workflow                                                          | Feature doc                                                  | Notes                                             |
| ---------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| `event start`                      | `src/lib/features/event-merit/session/draft/handleEventStart.ts`                  | `createEventDraft(...)` in `src/lib/services/event-lifecycle/`                    | [Event Session Lifecycle](/features/event-session-lifecycle) | tier autocomplete                                 |
| `event add_vc`                     | `src/lib/features/event-merit/session/add-vc/handleEventAddVc.ts`                 | `addTrackedChannel(...)` in `src/lib/services/event-lifecycle/`                   | [Event Session Lifecycle](/features/event-session-lifecycle) | event and voice-channel autocomplete              |
| `merit give`                       | `src/lib/features/merit/manual-award/handleGiveMerit.ts`                          | `awardManualMeritWorkflow(...)` in `src/lib/services/manual-merit/`               | [Merit System](/features/merit-system)                       | player, merit type, and recent-event autocomplete |
| `merit list`                       | `src/lib/features/merit/read/handleMeritList.ts`                                  | `loadInitialMeritList(...)` in `src/lib/services/merit-read/`                     | [Merit System](/features/merit-system)                       | user autocomplete                                 |
| `ticket name_change`               | `src/lib/features/ticket/request/handleNameChangeTicket.ts`                       | `submitNameChangeRequest(...)` in `src/lib/services/name-change/`                 | [Name Change Workflow](/features/name-change-workflow)       | no autocomplete                                   |
| `staff post_division_message`      | `src/lib/features/staff/division-selection/handlePostDivisionSelectionMessage.ts` | feature-owned post flow                                                           | [Division And Membership](/features/division-and-membership) | posts self-service division message               |
| `staff sync_nickname`              | `src/lib/features/staff/nickname-sync/handleStaffSyncNickname.ts`                 | `syncBulkNicknames(...)` in `src/lib/services/bulk-nickname/`                     | [Guild Member Automation](/features/guild-member-automation) | user autocomplete                                 |
| `staff division_membership add`    | `src/lib/features/staff/division-membership/handleDivisionMembershipCommand.ts`   | `applyDivisionMembershipMutation(...)` in `src/lib/services/division-membership/` | [Division And Membership](/features/division-and-membership) | division and user autocomplete                    |
| `staff division_membership remove` | `src/lib/features/staff/division-membership/handleDivisionMembershipCommand.ts`   | `applyDivisionMembershipMutation(...)` in `src/lib/services/division-membership/` | [Division And Membership](/features/division-and-membership) | division and user autocomplete                    |
| `dev sync_guild_members`           | `src/lib/features/dev/handlers/handleSyncGuildMembers.ts`                         | `syncGuildMembers(...)` in `src/lib/services/guild-member-sync/`                  | [Guild Member Automation](/features/guild-member-automation) | development only                                  |
| `dev nickname remove-prefix`       | `src/lib/features/dev/handlers/handleDevNicknameTransform.ts`                     | `transformBulkNicknames(...)` in `src/lib/services/bulk-nickname/`                | [Guild Member Automation](/features/guild-member-automation) | optional user autocomplete                        |
| `dev nickname remove-suffix`       | `src/lib/features/dev/handlers/handleDevNicknameTransform.ts`                     | `transformBulkNicknames(...)` in `src/lib/services/bulk-nickname/`                | [Guild Member Automation](/features/guild-member-automation) | optional user autocomplete                        |
| `dev nickname reset`               | `src/lib/features/dev/handlers/handleDevNicknameTransform.ts`                     | `transformBulkNicknames(...)` in `src/lib/services/bulk-nickname/`                | [Guild Member Automation](/features/guild-member-automation) | optional user autocomplete                        |

## Autocomplete Providers

| Command | Provider                                                                         | Main helper shape                                           | Feature doc                                                  |
| ------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| `event` | `src/lib/features/event-merit/session/autocomplete/eventAutocompleteProvider.ts` | route table plus event and voice-channel choice helpers     | [Event Session Lifecycle](/features/event-session-lifecycle) |
| `merit` | `src/lib/features/merit/autocomplete/meritAutocompleteProvider.ts`               | route table plus access policy, guards, and choice builders | [Merit System](/features/merit-system)                       |
| `staff` | `src/lib/features/staff/autocomplete/staffAutocompleteProvider.ts`               | division and member lookup helpers                          | [Division And Membership](/features/division-and-membership) |
| `dev`   | `src/lib/features/dev/devAutocompleteProvider.ts`                                | guild-member lookup helpers                                 | [Guild Member Automation](/features/guild-member-automation) |

## Button And Modal Interactions

| Surface                       | Interaction handler                                     | Decoder / custom-id family                                                           | Routed feature handler               | Main service                                           | Feature doc                                                              |
| ----------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| division selection buttons    | `src/interaction-handlers/divisionSelectionButton.ts`   | `parseDivisionSelection.ts` and division-selection custom ids                        | `handleDivisionSelectionButton.ts`   | `divisionSelectionService.ts`                          | [Division And Membership](/features/division-and-membership)             |
| event start buttons           | `src/interaction-handlers/eventStartButtons.ts`         | `parseEventStartButton.ts` and event-start button custom ids                         | `handleEventStartButton.ts`          | `eventLifecycleService.ts`                             | [Event Session Lifecycle](/features/event-session-lifecycle)             |
| event review buttons          | `src/interaction-handlers/eventReviewButtons.ts`        | `parseEventReviewButton.ts` and event-review paging, decision, and submit custom ids | `handleEventReviewButton.ts`         | `eventReviewService.ts` and `eventLifecycleService.ts` | [Event Review And Finalization](/features/event-review-and-finalization) |
| merit list buttons            | `src/interaction-handlers/meritListButtons.ts`          | `parseMeritListButton.ts` and merit-list page custom ids                             | `handleMeritList.ts`                 | `meritReadService.ts`                                  | [Merit System](/features/merit-system)                                   |
| name-change review buttons    | `src/interaction-handlers/nameChangeReviewButtons.ts`   | `nameChangeReviewButtons.ts` and name-change review button custom ids                | `handleNameChangeReviewButton.ts`    | `name-change` service functions                        | [Name Change Workflow](/features/name-change-workflow)                   |
| name-change review edit modal | `src/interaction-handlers/nameChangeReviewEditModal.ts` | `nameChangeReviewButtons.ts` and name-change review edit modal custom ids            | `handleNameChangeReviewEditModal.ts` | `editPendingNameChangeRequest(...)`                    | [Name Change Workflow](/features/name-change-workflow)                   |

## Runtime Listeners And Scheduled Tasks

These are not user-invoked command surfaces, but contributors often need them for debugging.

| Surface                | Shell                                         | Main workflow                                                                                        |
| ---------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| guild member add       | `src/listeners/guildMemberAdd.ts`             | `src/lib/features/guild-member/handlers/handleGuildMemberAdd.ts`                                     |
| guild member update    | `src/listeners/guildMemberUpdate.ts`          | `src/lib/features/guild-member/handlers/handleGuildMemberUpdate.ts` -> `guildMemberChangeService.ts` |
| ready                  | `src/listeners/ready.ts`                      | runtime initialization                                                                               |
| division cache refresh | `src/scheduled-tasks/divisionCacheRefresh.ts` | runtime cache refresh                                                                                |
| event tracking tick    | `src/scheduled-tasks/eventTrackingTick.ts`    | `eventTrackingService.ts`                                                                            |

## Read This Next

- For layer definitions:
  [Codebase Terminology](/architecture/codebase-terminology)
- For aggregate ownership:
  [Aggregate Reference](/reference/aggregate-reference)
- For extension patterns:
  [Discord Extension Patterns](/architecture/discord-extension-patterns)
