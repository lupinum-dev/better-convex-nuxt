# 01 Kanban Workspace

Inspired by: **Trello**

## Why this example exists

This is the cleanest test of whether Trellis can support a collaborative SaaS app without feeling heavy.

It looks simple.
It is not.

It pressures:

- workspace tenancy
- role-based membership
- real-time updates
- ordered lists and cards
- optimistic mutations
- cross-user collaboration
- activity/audit trails

If Trellis cannot make this feel smooth, it is not yet a general app layer.

## What Trellis must make easy

- tenant-scoped boards, lists, and cards
- role-based actions like create list, move card, archive board
- operation-backed destructive actions like archive/delete board
- comments and activity streams on the same protected model
- public invite or join flows without breaking tenant safety

## Agent story

Agents should be able to:

- list boards and cards they can access
- summarize stale work
- propose reprioritization
- move cards only through safe mutations
- archive boards only through operation-backed destructive tools

## What this example validates

- default protected queries/mutations
- tenancy and `ctx.db.crossTenant`
- operations for destructive actions
- real-time UI + optimistic updates
- agent exposure over the same domain model

