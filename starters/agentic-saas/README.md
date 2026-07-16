# Agentic SaaS Starter

Reference starter for tenant-aware SaaS apps where agents are first-class product
actors without becoming a privileged side door.

## Ownership

Better Auth remains the canonical source for auth-domain state:

- users
- organizations
- memberships
- invitations
- roles
- sessions

This starter intentionally has no app-owned `organizations` or
`memberships` tables. App tables store Better Auth ids as strings.

## Covered contracts

- app-owned `agentRuns` are the delegation source for agent tool calls;
- Better Auth Organization is wired through a local Better Auth component for
  run-start authorization;
- delegated run start has a check-before-insert contract for Better Auth-style
  organization permissions;
- live Better Auth `hasPermission()` allows an organization owner to start a
  delegated run and denies an outsider without creating an `agentRuns` row;
- public run start is Better Auth-backed, and old-shape caller-supplied
  delegating user ids are runtime-rejected before creating an
  `agentRuns` row;
- public agent execution, revocation, message reads, stream reads, and
  retention cleanup take `agentRunId` only and derive the organization and
  component thread id from `agentRuns`; this run-id public surface is
  source-tested against caller-supplied organization, thread, user, and token
  arguments;
- run start rejects blank or over-120-character agent names and stores
  deduplicated capability lists in stable canonical order; persisted component
  thread ids are capped at 512 characters;
- invalid run expiry and token budgets are rejected before creating an
  `agentRuns` row;
- public approval/rejection mutations expose review-row-id-only surfaces;
  they derive the human actor from a Better Auth
  session and reject caller-supplied user ids;
- pending approval queue reads require Better Auth `project:read` permission,
  return at most 100 rows per review type, and reject new agent-created review
  rows while that organization queue is full;
- Better Auth organization permission failure blocks draft approval and
  destructive approval without mutating product state;
- approval/rejection mutations derive the organization from the draft/deletion
  request row before checking Better Auth permissions, so caller-supplied
  organization ids cannot steer decision authorization;
- denied or mismatched permission checks do not create `agentRuns`;
- only the delegating Better Auth user can revoke their own active agent run;
- public revocation prevents later execution and leaves no Agent thread, draft,
  audit, or usage side effects;
- agent tool calls reject wrong organizations;
- agent tool calls reject undelegated capabilities;
- expired active runs fail before Agent thread, draft, audit, or usage side
  effects;
- expired running runs cannot attach an Agent component thread id after claim;
- the execution claim re-checks the delegating user's current Better Auth
  project permission before creating an Agent thread or tool side effects, so
  role downgrade or member removal blocks stale delegated runs;
- destructive agent tools re-check the delegating user's current Better Auth
  membership and configured project role at execution time;
- member downgrade or removal after delegation blocks future destructive agent
  tool calls without mutating product state;
- agent audit rows record successful agent product actions without unused
  outcome/result fields;
- product and agent audit action/resource labels are schema-bounded, so adding
  a new audit kind requires an intentional schema change, and retained audit
  rows require resource ids;
- agent audit for deletion-request creation points at the created review row;
  the target product record stays on the request and later product audit;
- human rejection audit for drafts and deletion requests points at the decided
  review row and matching source id;
- default agent writes create draft product state;
- blank or oversized agent-created draft content and deletion reasons are
  rejected before inserting review rows or agent audit events (200-character
  titles, 20,000-character bodies, and 1,000-character reasons);
- human approval promotes draft state into canonical product records;
- already-decided drafts cannot be approved or rejected again;
- destructive agent actions create pending approval requests and do not mutate
  canonical product records before human approval;
- duplicate pending destructive requests for the same canonical product record
  are rejected;
- already-decided destructive requests cannot be approved or rejected again;
- canonical product create/delete logic lives in source-tested product-domain
  helpers used by the approval mutations;
- Convex Agent component config and component-backed thread creation inside
  checked Agent run actions in `convex-test`;
- Convex Agent message persistence and real tool execution with a mock LLM;
- Convex Agent `streamText` delta persistence with a mock LLM;
- read-only streaming creates Agent stream and usage history without product
  records, draft rows, or agent product-audit rows;
- non-delegating users cannot execute another user's read-only stream run;
- real provider SDK dependencies, runtime imports, and provider API-key env
  access stay out of the starter until provider-backed execution is proven;
- Agent actions derive the Agent thread user and usage attribution from
  `agentRuns.startedByAuthUserId` instead of accepting caller-supplied user ids,
  and thread-user attribution is source-tested;
- Agent actions require the current Better Auth session to belong to the
  delegating user before creating a thread or executing tools, and derive the
  organization from `agentRuns` instead of accepting caller-supplied
  organization ids;
- Agent actions claim an `active` run exactly once as `running` before creating
  the Agent component thread, recording usage, or invoking tools; duplicate
  execution attempts fail before draft, usage, or thread side effects;
- Agent tool input carries product content only. `organizationId` and
  `agentRunId` are bound from the checked action context, so model-controlled
  tool arguments cannot retarget delegated authority;
- agent-created draft/request helpers derive organization from `agentRuns` or
  the target product record instead of accepting helper-supplied organization
  ids, are source-tested as internal mutations, and require a `running` run
  with an attached Agent component thread before writing review or audit rows;
- UI-facing Agent message reads require Better Auth `project:read`, the
  matching delegated run, and the delegating user who started the run; they
  derive the organization and normalized component thread id from `agentRuns`;
- UI-facing Agent stream sync requires Better Auth `project:read`, the matching
  delegated run, and the delegating user who started the run; it derives the
  organization and normalized component thread id from `agentRuns`; completed
  stream history remains readable after `expiresAt`;
- Agent tools call source-tested internal agent-facing product mutation helpers,
  not public side-door mutations;
- cross-organization tool denial is proven through product helpers, not a
  separate capability-check bridge export;
- successful Agent tool runs are marked `completed` only after a stored Agent
  thread exists; completed runs remain readable as history but cannot call tools
  again;
- agent run lifecycle status writes are source-tested as centralized in
  `agentRuns.ts`, and terminal failed/completed/revoked states cannot be
  reclassified through lifecycle helpers;
- completed runs remain readable after `expiresAt` because expiry bounds active
  delegation, not history;
- completed runs cannot be revoked because revocation is for active delegation;
- unauthorized action attempts do not fail active runs, and failed action
  attempts cannot overwrite completed or revoked run states;
- failed Agent executions reject that run's bounded pending
  draft/deletion-request rows with `decidedAt`, so failed runs can retain
  diagnostic history without leaving human-approvable or queue-visible product
  review state behind;
  already-decided review rows are not re-decided by run failure; a later
  retention cleanup can delete the failed run's stored Agent thread and usage
  history while keeping rejected review rows;
- Convex Agent `usageHandler` records internal append-only usage events keyed
  by the organization, agent run, delegating user, normalized non-empty model
  and provider labels capped at 200 characters, and valid non-negative token
  counts whose total covers prompt plus completion and whose cached input count
  does not exceed prompt tokens; the app-owned schema is source-tested to keep
  raw usage events instead of billing rollups, projections, caches, or invoice
  tables;
- usage events require the callback Agent thread id to match the canonical
  thread stored on `agentRuns`, then store the run-derived thread id so
  wrong-thread usage cannot become derived billing/retention state;
- usage events require the run to still be running and unexpired, so expiry
  bounds usage accrual as well as tool execution;
- usage events derive `organizationId`, `agentRunId`, and
  `startedByAuthUserId` from `agentRuns` instead of accepting callback identity
  metadata or duplicating the run name;
- per-run token budgets stop over-budget Agent runs before recording the
  over-budget usage event;
- each run stores at most 100 raw usage events, so per-run budget checks and
  retention batches have fixed read/write bounds without aggregate rollups or
  a second billing source of truth;
- server-only secret material stays outside model-visible tool args, and
  persisted Agent messages contain a redacted marker without the raw server-only
  secret canary;
- retention cleanup starts the Convex Agent component's supported 100-row
  asynchronous thread deletion and removes at most 100 app usage events for a
  terminal run per command; it reports whether legacy usage rows need another
  call, rejects active and running runs before checking thread state, and
  retains product draft and audit history, including rejected review rows from
  failed runs; repeating the cleanup is safe, and same-org readers cannot
  retention-delete another delegator's run;
- audit records `actor.kind = "agent"` and `delegatedByAuthUserId`;
- a Nuxt approval queue page reads pending drafts and destructive requests from
  canonical Convex tables and calls the same Better Auth-checked approval
  mutations;
- anonymous local Convex installs the Agent and Better Auth components, runs
  backend typecheck, and makes `convex codegen` pass;
- the Nuxt approval queue runs against local Convex HTTP actions with a real
  Better Auth browser session: sign up, create organization, create agent
  draft, list pending draft, approve draft, and write canonical product/audit
  rows.

## Out of scope

- real provider LLM generation and provider-backed streaming;
- real configured Convex project deployment;
- authenticated approval queue runtime against a cloud/project deployment;
- billing rollups and cost calculations;
- MCP transport;
- public OAuth/MCP auth.

## Validation Commands

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm convex:local:once
pnpm convex:codegen
```

`pnpm build` also starts the generated Nitro server and asserts that `/`
returns the Agentic SaaS approval queue with HTTP 200.

If `pnpm convex:local:once` fails schema validation against old rows while
using an anonymous local deployment, delete the generated local backend state
and rerun before treating the result as evidence:

```bash
rm -rf .convex .env.local
pnpm convex:local:once
pnpm convex:codegen
```

For local browser runtime verification:

```bash
pnpm convex:local:once
pnpm exec convex env set SITE_URL http://127.0.0.1:3000
pnpm exec convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
NUXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210 \
NUXT_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3211 \
SITE_URL=http://127.0.0.1:3000 \
pnpm dev
```

## Template Cutover

Before using this reference as a shipped SaaS template, retain its public auth
argument boundary, keep provider mocks confined to tests, and rerun the browser
flow after product or UX changes.
