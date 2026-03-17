---
title: Discord Execution Model
sidebar_position: 2
---

# Discord Execution Model

## Slash Commands

Command classes in `src/commands/` should be treated as routing tables.

They are responsible for:

- registering slash commands and autocomplete options
- creating command-scoped execution context through `createCommandExecutionContext(...)`
- dispatching to feature handlers

They are not supposed to own workflows.

Current command shells:

- `src/commands/event.ts`
- `src/commands/merit.ts`
- `src/commands/staff.ts`
- `src/commands/ticket.ts`
- `src/commands/dev.ts`

## Buttons And Modals

Buttons and modals are routed through `src/interaction-handlers/`.

The common pattern is:

1. decode `customId`
2. create execution context
3. route to a feature handler

That pattern is shared by:

- `src/lib/discord/routedInteractionHandler.ts`
- feature-local codec modules built on `src/lib/discord/customId.ts`

## Shared Discord Edge Helpers

The main Discord-facing helpers live in `src/lib/discord/`.

Important groups:

- preflight and actor resolution
    - `resolveConfiguredGuild.ts`
    - `resolveGuildMember.ts`
    - `resolveInteractionActor.ts`
    - `interactionPreflight.ts`
- response delivery
    - `interactionResponder.ts`
    - `interactionResponderDelivery.ts`
    - `interactionFailurePayload.ts`
- autocomplete
    - `autocompleteRouter.ts`
    - `autocompleteRouteHelpers.ts`
    - `autocompleteResponder.ts`
- custom-id and interaction routing
    - `customId.ts`
    - `routedInteractionHandler.ts`

These helpers exist so handlers can show domain intent early instead of spending half the file on Discord plumbing.

## Preconditions

Preconditions such as `StaffOnly` and `EventOperatorOnly` live in `src/preconditions/`.

Use a precondition when:

- the rule applies to an entire command
- early rejection is the right UX

Use a service-level capability check when:

- the same workflow can be reached through more than one transport
- the rule depends on domain state, not just Discord roles

## Listener And Scheduled-Task Shells

Listeners and scheduled tasks follow the same shell idea:

- create execution context with `createExecutionContext(...)`
- gather minimal runtime state
- dispatch into feature or service code

Examples:

- `src/listeners/guildMemberAdd.ts`
- `src/listeners/guildMemberUpdate.ts`
- `src/scheduled-tasks/eventTrackingTick.ts`

## Error And Denied Paths

Fallback command edges live in:

- `src/listeners/commands/chatInputCommands/chatInputCommandDenied.ts`
- `src/listeners/commands/chatInputCommands/chatInputCommandError.ts`
- `src/listeners/commands/chatInputCommands/chatInputCommandSuccess.ts`

These are shell-level concerns. Feature handlers should still return typed results when they can.

## Extension Checklist

If you add a new command:

1. keep the command class small
2. use `createCommandExecutionContext(...)`
3. route to a feature handler
4. use preflight and responder helpers in the handler
5. move real business logic into a service

If you add a new button or modal:

1. create or extend a typed codec
2. register an interaction handler
3. use `RoutedButtonInteractionHandler` or `RoutedModalInteractionHandler`
4. keep the decoded payload typed
5. route to a feature handler that uses the same preflight and responder vocabulary

## Read This Next

- For worked examples:
  [Discord Extension Patterns](/architecture/discord-extension-patterns)
- For layer definitions:
  [Architecture Vocabulary](/architecture/vocabulary)
- For public entrypoints:
  [Command And Interaction Catalog](/reference/command-and-interaction-catalog)
