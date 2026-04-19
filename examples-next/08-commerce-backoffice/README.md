# 08 Commerce Backoffice

Concept brief only. Not runnable yet.

Inspired by: **Shopify admin, Stripe dashboard**

## Why this example exists

Commerce and billing apps pressure the hardest parts of application safety:

- money-adjacent destructive actions
- entitlements
- operator/admin views
- audit trails
- refund/cancel/retry flows
- webhook-heavy state transitions

This is where fake safety gets exposed.

## What Trellis must make easy

- organization or merchant scoping
- operator-only cross-tenant support workflows
- operation-backed refund/cancel/archive actions
- webhook ingestion without bypassing the main auth model
- durable audit records for high-risk changes

## Agent story

Agents should be able to:

- summarize account health
- identify failed payment patterns
- prepare refund or cancellation previews
- never execute high-risk actions without human confirmation

## What this example validates

- destructive operation model under real pressure
- service/webhook trust boundaries
- audit and replay protection
- whether `ctx.db.crossTenant` remains disciplined in serious admin software
