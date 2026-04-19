# 02 Product Issue Tracker

Concept brief only. Not runnable yet.

Inspired by: **Linear**

## Why this example exists

A kanban board proves collaborative CRUD.
A product issue tracker proves **workflow integrity**.

This example pressures:

- state machines and workflow transitions
- team/project scoping
- assignees and triage
- labels, filters, and saved views
- cycle and milestone planning
- high-signal mutations that must stay safe under automation

## What Trellis must make easy

- explicit operations like triage, assign, close, reopen, merge, cancel
- policy checks that care about both actor role and issue state
- list views that stay reactive without leaking cross-team data
- public/internal split for customer-facing issue submissions vs internal workflow
- webhooks for external sync without inventing a second auth system

## Agent story

Agents should be able to:

- summarize hot issues
- propose priorities
- label and route work
- draft release notes
- perform destructive bulk actions only through confirmation-backed operations

## What this example validates

- operations as a first-class business seam
- richer authorization than plain tenant membership
- capability-aware agent tooling
- safe workflow automation
