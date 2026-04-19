# 07 Support Inbox CRM

Concept brief only. Not runnable yet.

Inspired by: **Intercom, Zendesk, HubSpot**

## Why this example exists

Support and CRM apps create ugly but extremely common pressure:

- internal notes vs customer-visible replies
- assignment and escalation
- customer/account visibility
- external webhook integrations
- auditability on sensitive actions

If Trellis wants to be a general application layer, it has to survive this kind of app.

## What Trellis must make easy

- organization/account/customer scoping
- strict visibility boundaries on replies, notes, and account metadata
- safe integration handlers for external systems
- assignment flows and SLA-sensitive mutations
- operator-only cross-tenant reads where justified and auditable

## Agent story

Agents should be able to:

- summarize threads
- draft replies
- classify and route tickets
- suggest next steps from account context
- avoid seeing notes or data the acting user should not access

## What this example validates

- field visibility and redaction
- webhook and integration safety
- operator/admin access patterns
- realistic agent assistance in high-sensitivity apps
