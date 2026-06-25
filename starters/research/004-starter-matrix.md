# 004 Starter Matrix

## Principle

Each starter is a real app posture. Do not implement starter choice as feature
flags inside one app.

```text
Good:
starters/team
starters/agency
starters/mcp-agent

Bad:
starters/app --preset team --enable-agency --enable-mcp
```

## Matrix

| Starter | Auth | Org | Delegated Access | MCP | Agents | Approval | Best For |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `public` | No | No | No | No | No | No | Public CRUD, demos, marketing-backed tools |
| `personal` | Yes | No | No | No | Optional recipe | No | Solo dashboards and private tools |
| `team` | Yes | Yes | No | No | Optional recipe | For sensitive app writes | B2B SaaS baseline |
| `agency` | Yes | Yes | Yes | Optional recipe | Optional recipe | For delegated/sensitive writes | Agencies, client portals |
| `mcp-agent` | Yes | Yes | Optional | Yes | Yes | Yes | Agent-enabled SaaS |
| `vertical-ai` | Yes | Usually | Optional | Optional | Yes | Yes | AI-assisted vertical SaaS |

## Recommended Build Order

1. `public`
2. `team`
3. `agency`
4. `mcp-agent`
5. `vertical-ai`
6. `personal` if a real app needs it before `team`

Why this order:

- `public` proves the lightweight base.
- `team` proves B2B core without agency complexity.
- `agency` forces delegated access to be designed correctly.
- `mcp-agent` can reuse the access model instead of inventing one.
- `vertical-ai` validates Convex Agent, drafts, approvals, and usage/rate-limit
  concerns in a domain app.

## Folder Contract

Each starter should be self-contained:

```text
starters/team/
  README.md
  AGENTS.md
  package.json
  nuxt.config.ts
  app/
  convex/
  tests/
```

Shared docs and recipes:

```text
starters/research/
starters/recipes/
  auth/
  mcp/
  agent/
  workos/
  audit-export/
```

If shared code is extracted later:

```text
packages/convex-b2b/
```

Do not create this package until duplication across starters proves the exact
API.

## Copyable Over Configurable

Starters may duplicate similar files. Duplication is acceptable when it keeps
the app understandable and avoids a hidden framework.

Extract only when:

1. the same invariant appears in multiple starters;
2. the API is smaller than the duplicated code;
3. tests can prove the invariant independently;
4. extraction does not create a second source of truth.

## Naming

Prefer user-facing nouns:

- `team`, not `workspace-rbac`.
- `agency`, not `managed-access`.
- `mcp-agent`, not `workspace-mcp`.
- `vertical-ai`, not `agentic-saas`.

The internals can use precise terms; starter names should map to product
intent.
