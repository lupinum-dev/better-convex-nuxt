# 001 Local Lessons

## Sources Inspected

- `better-convex-nuxt`: Nuxt module, demo, playground, composables, auth, SSR,
  devtools.
- `trellis`: framework attempt with starter lanes, operation graph, MCP runtime,
  bridge package, doctor, examples.
- `lupinum`: Convex-first framework attempt with workspaces, managed agency
  access, generated reads/operations, private MCP, agents, operation safety.
- `convex-tenants`: Convex component for organizations, teams, invitations, and
  tenant management.
- `convex-authz`: Convex component for RBAC, ABAC, ReBAC, materialized effective
  permissions, custom roles, and audit.
- Pasted `convex-helpers` notes: custom functions, RLS, validators, pagination,
  query streams, caching, API generation, triggers, CORS.

## What Worked

### Better Convex Nuxt

Keep:

- Direct Nuxt module setup.
- Convex composables that call normal Convex functions.
- SSR/hydration/realtime as app ergonomics.
- Server helpers as transport helpers.
- Devtools as diagnostics, not source of truth.

Avoid:

- Making the module own product architecture.
- Shipping starter-specific domain decisions in the integration package.

### Trellis

Keep:

- One protected backend decision path.
- MCP tools reuse backend authorization.
- Destructive MCP tools need stronger handling than normal reads.
- Starter lanes are useful as product shapes.
- Doctor/checks are useful after a starter has generated or derived artifacts.

Reject for starters:

- Framework-first posture.
- CLI ladder as the primary mental model.
- Operation graph/codegen as the default for every app.
- Bridge exports and integration machinery in starter apps.
- Doctor as a substitute for simple app code.

### Lupinum

Keep:

- Agency/client managed access is a real requirement.
- Service actors/API keys are useful for private MCP and automation.
- Tool listings are advisory; backend execution must re-check current authority.
- Confirmation v0 is a useful small primitive: actor, workspace, operation, args
  hash, expiry, single use.
- Private MCP bearer keys are acceptable for private workspace MCP, but public
  MCP needs OAuth-grade work.

Reject for starters:

- Manifest/codegen/platform layer as default.
- Generated protected reads/operations for simple apps.
- Operation projection as the first abstraction.
- Generic agent-state package before using Convex Agent.

### Convex Tenants

Keep:

- Organizations/workspaces, memberships, invitations, status, transfer/ownership
  concepts.
- Flexible role strings.
- Tenant-scoped indexes.
- Lifecycle tests around invitation and membership edges.

Be careful:

- Teams/nested teams are not default starter requirements.
- React UI/provider exports are not relevant for Nuxt starters.
- Callback/hook-heavy factory APIs can become a second framework.

### Convex Authz

Keep as later reference:

- Typed permission vocabulary.
- Scoped permissions.
- Auditability for authorization changes.
- Rebuild story if materialized permissions exist.

Reject for v1 starters:

- ABAC by default.
- ReBAC by default.
- Materialized effective permission tables by default.
- Custom tenant-defined roles by default.
- Permission override tables by default.

These are powerful, but they introduce another source of truth unless the app
has proven need.

### Convex Helpers

Use selectively:

- `customQuery` / `customMutation`: good candidate for injecting actor/access
  context once repetition appears.
- Row-level security wrappers: useful for high-risk shared tables, but not a
  beginner default if explicit `requireOrgAccess` keeps code clearer.
- Validator utilities: useful when schemas/args repeat.
- Paginator/query streams: useful only when starter requirements need complex
  pagination.
- Triggers: use when an invariant must run on every write path; require lint
  rules or clear import discipline.

Do not default to:

- CRUD generators for public product APIs.
- Query caching as architecture.
- Triggers for ordinary domain flow when direct mutations are clearer.

## Main Lesson

The reusable part is not the whole app shape. The reusable part is the small set
of backend invariants that every serious B2B or agent-enabled app otherwise
gets wrong:

- actor resolution;
- organization membership;
- delegated agency/client access;
- service actor authority;
- role/permission checks;
- audit/security events;
- destructive approval for sensitive external tool calls.

Everything else should live in prepared starters or copyable recipes.
