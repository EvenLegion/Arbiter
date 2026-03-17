---
title: Aggregate Reference
sidebar_position: 2
---

# Aggregate Reference

Use this page when you need to answer:

- where does this state live?
- which repository owns it?
- which services are allowed to change it?

## Aggregate Summary

| Aggregate                     | Authoritative store       | Repository                  | Primary service owners                                                                      |
| ----------------------------- | ------------------------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| user                          | Postgres                  | `userRepository`            | `nickname`, `guild-member-sync`, `guild-member-change`, `manual-merit`, `name-change`       |
| division                      | Postgres + division cache | `divisionRepository`        | `division-selection`, `division-membership`, `guild-member-change`                          |
| division membership           | Postgres                  | `divisionRepository`        | `division-membership`, `guild-member-change`, `guild-member-sync`                           |
| event session                 | Postgres                  | `eventRepository`           | `event-lifecycle`, `event-tracking`                                                         |
| event tier                    | Postgres                  | `eventRepository`           | `event-lifecycle`, merit linking, autocomplete                                              |
| event review decision         | Postgres                  | `eventReviewRepository`     | `event-review`, `event-lifecycle` finalization                                              |
| event participant stat        | Postgres                  | `eventReviewRepository`     | `event-lifecycle` review initialization, `event-review`, `event-tracking` finalization path |
| merit                         | Postgres                  | `meritRepository`           | `manual-merit`, `merit-read`, `event-lifecycle` finalization                                |
| name change request           | Postgres                  | `nameChangeRepository`      | `name-change`                                                                               |
| active event tracking session | Redis                     | Redis eventTracking modules | `event-tracking`, `event-lifecycle` start/end hooks                                         |

## User

Repository:

- `src/integrations/prisma/repositories/userRepository.ts`

Main state:

- Discord ids and usernames
- persisted nickname value
- avatar URL

Primary workflows:

- new member add
- guild-member bulk sync
- nickname sync
- manual merit award target resolution
- name-change requester and reviewer resolution

## Division And Division Membership

Repository:

- `src/integrations/prisma/repositories/divisionRepository.ts`

Runtime support:

- `src/utilities/divisionCache.ts`

Primary workflows:

- self-service division selection
- staff division membership mutation
- guild member reconciliation
- nickname prefix computation
- autocomplete and permission rules

## Event Session And Event Tier

Repository:

- `src/integrations/prisma/repositories/eventRepository.ts`

Primary workflows:

- event draft creation
- tracked channel management
- lifecycle transitions
- event-tier lookup during draft creation and autocomplete
- event lookup during manual merit linking

Notes:

- event session state is authoritative in Postgres
- live attendance tracking state is not stored on the event session row during active tracking; it lives in Redis until review/finalization flows persist participant stats

## Event Review Decision And Participant Stat

Repository:

- `src/integrations/prisma/repositories/eventReviewRepository.ts`

Primary workflows:

- review-page loading
- attendee decision persistence
- participant-stat initialization
- review finalization

Notes:

- review-page rendering depends on both participant stats and review decisions
- finalization may create merit records and move the session to a finalized state

## Merit

Repository:

- `src/integrations/prisma/repositories/meritRepository.ts`

Primary workflows:

- manual merit awards
- merit list read flow
- merit-rank calculation inputs
- event finalization with merits

Notes:

- merit rank is derived from merit totals and policy, not stored as authoritative state
- manual merit and event-finalization merit creation intentionally share the same aggregate

## Name Change Request

Repository:

- `src/integrations/prisma/repositories/nameChangeRepository.ts`

Primary workflows:

- request submission
- pending request edit
- approval or denial
- review-thread synchronization

Notes:

- approval may also trigger persisted nickname update and Discord nickname sync through the nickname service boundary

## Active Event Tracking Session

Store:

- `src/integrations/redis/eventTracking/`

Primary workflows:

- event start begins Redis-backed tracking
- periodic tick updates active attendance state
- event end stops tracking
- review initialization consumes tracking snapshots and persists review state

Notes:

- this state is operational and derived, not authoritative finalized attendance history

## Read This Next

- For repository and storage rules:
  [Data And Storage](/architecture/data-and-storage)
- For feature-specific behavior:
  the relevant feature page
- For tests and refactors:
  [Testing And Refactors](/contributing/testing-and-refactors)
