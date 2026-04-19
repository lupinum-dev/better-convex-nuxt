# 06 Agency Client Ops

Concept brief only. Not runnable yet.

Inspired by: **agency OS / client portal software**

## Why this example exists

Yes, this should be a first-class example family.

An agency model is not just “multi-workspace, but more.”
It creates a distinct pressure shape:

- one internal agency team
- many client workspaces
- staff who legitimately work across many client tenants
- client members who must only see their own workspace
- cross-client portfolio views that are valid for operators but dangerous if the model is sloppy

This is one of the best tests of whether Trellis can handle real-world B2B complexity without turning tenancy into hand-written glue.

## The core domain

- **Agency**
  the top-level operator organization
- **Client workspace**
  an isolated tenant for one customer
- **Agency staff membership**
  internal roles like owner, ops, strategist, designer, support
- **Client membership**
  client-side roles like owner, admin, reviewer, guest
- **Projects**
  work that lives inside a client workspace
- **Portfolio dashboard**
  aggregated, operator-only view across many client workspaces

## What Trellis must make easy

- client workspaces as real tenants
- staff actors who can access multiple client workspaces without becoming global gods
- workspace switching that is explicit and auditable
- operator-only cross-workspace portfolio queries
- client-safe UI where a customer never sees another customer’s data
- project/task/comment systems that stay simple inside each client workspace

## The tricky cases this must validate

- an agency admin can see summary metrics across all client workspaces
- a strategist can access only assigned client workspaces
- a freelancer can access one project in one client workspace and nothing else
- a client admin can invite their own team but never see agency-internal notes
- an internal operator can perform a cross-tenant fix through `ctx.db.crossTenant`, and that decision is visible and auditable

## Agent story

Agents should be able to:

- summarize risk across assigned client accounts
- produce weekly client status recaps
- identify overdue deliverables across a strategist’s portfolio
- draft client-facing updates from visible data only
- perform bulk admin actions only through protected operations

## What this example validates

- multi-workspace actor resolution
- explicit workspace switching
- cross-tenant operator access without tenant collapse
- role layering between internal staff and external client members
- whether Trellis can model a real agency graph cleanly enough to deserve “general application layer” status
