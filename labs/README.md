# Labs

This folder is Trellis's archived and experimental example portfolio.

It is not part of the canonical public learning path.

Use `examples/` when you want maintained public reference apps. Use `labs/` when you want to inspect future framework pressure and unfinished example families.

## Current status

| Example                      | Status        | Why it exists                                                                |
| ---------------------------- | ------------- | ---------------------------------------------------------------------------- |
| `02-product-issue-tracker`   | Concept brief | Pressures workflow/state-machine-heavy product execution software            |
| `03-docs-wiki`               | Concept brief | Pressures nested visibility, sharing, and document-aware agent access        |
| `04-community-courses`       | Concept brief | Pressures auth, membership, billing-aware access, and moderation             |
| `05-headless-cms-publishing` | Concept brief | Pressures editorial workflows and projection into a consumer surface         |
| `06-agency-client-ops`       | Concept brief | Pressures explicit agency/client graphs and operator-safe cross-tenant views |
| `07-support-inbox-crm`       | Concept brief | Pressures visibility boundaries, integrations, and operator workflows        |
| `08-commerce-backoffice`     | Concept brief | Pressures audit-heavy destructive actions and webhook-driven state           |
| `09-agent-operator-console`  | Concept brief | Pressures the human-plus-agent operating model directly                      |

No entry in this folder is part of the maintained public contract. They are intentionally brief until they earn real implementation time.

## Portfolio rules

Every entry here must prove at least one of these:

1. a core Trellis primitive is reusable across app families
2. a claimed framework guarantee survives realistic app pressure
3. an advanced use case can be reached without bending the core into knots
4. agent support stays on the same backend model instead of becoming a side system

If an entry does not pressure the framework, it is marketing, not validation.

## Relationship to `examples/`

`examples/` is the maintained public example set today:

- `01 -> 02 -> 03 -> 04` is the first-reader ladder
- `05–06` are maintained pattern catalogs
- `07` is the maintained MCP reference
- `08` is the maintained component-boundary reference

`labs/` is not replacing that set yet. It is the future portfolio under evaluation.

## Official product surface

The official starters are:

- `public`
- `personal`
- `workspace`
- `cms`

MCP remains a capability on `workspace`, not a separate starter.

Future example families may later pressure new starter lanes, but nothing in this folder is a starter promise until it ships.
