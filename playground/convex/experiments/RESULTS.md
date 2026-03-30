# Experiment Results — better-convex-nuxt v2

**Date:** 2026-03-30
**Status:** ALL 5 EXPERIMENTS PASS

---

## Summary

| #   | Experiment                    | Result | What It Proved                                                                                                                 |
| --- | ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Scoped Builder Wrapping       | PASS   | Test-only `createFunctions()` can hide service auth args and hand handlers `{ db, actor, raw }`                                |
| 2   | Query Chain Fidelity          | PASS   | `withIndex()` composes correctly with `collect`, `order`, `filter`, `take`, `first`, and `paginate`                            |
| 3   | Unified Schema                | PASS   | A single `defineSchema()` can produce validators, generated field metadata, Zod validation, and `parse()`                      |
| 4   | MCP Tool Factory              | PASS   | A single factory can provide one ctx shape, auth gating, permission checks, destructive previews, and scoped service injection |
| 5   | Resource Loader + Permissions | PASS   | Declarative `resource` loading can enforce existence, org isolation, ownership checks, and cross-table authorization           |

---

## What Ran

- `pnpm vitest run --project=convex playground/convex/v2-experiments.test.ts`
- `pnpm vitest run --project=unit test/unit/v2-schema-experiment.test.ts test/unit/v2-mcp-experiment.test.ts`
- `pnpm test:types`

---

## Details

### 1. Scoped Builder Wrapping

- Test module: `playground/convex/experiments/v2_functions.ts`
- Verified `public`, `authed`, and `scoped` builder paths
- Verified hidden service auth fields are stripped before business inserts
- Verified scoped handlers default to scoped `db` and require explicit `raw.ctx` to break out

### 2. Query Chain Fidelity

- Test file: `playground/convex/v2-experiments.test.ts`
- Verified a `withIndex('by_organization', ...)` query can be chained with:
  - `collect()`
  - `order('desc').collect()`
  - `filter().collect()`
  - `order().filter().take()`
  - `first()`
  - `paginate()`
- One important constraint surfaced during the run: Convex query objects are single-use once iteration begins. The experiment now recreates the base query per assertion.

### 3. Unified Schema

- Helper: `test/helpers/v2-schema-experiment.ts`
- Runtime tests: `test/unit/v2-schema-experiment.test.ts`
- Type check: `test/types/v2-schema-experiment.types.ts`
- Verified:
  - `schema.validators`
  - generated `schema.meta.fields`
  - `schema.zod.parse(...)`
  - `schema.parse(...)`
  - optional fields
  - compile-time rejection of extra meta keys

### 4. MCP Tool Factory

- Test file: `test/unit/v2-mcp-experiment.test.ts`
- Verified:
  - auth-required tools can be hidden from anonymous callers
  - permissions run before the handler
  - one ctx shape supports `query`, `mutation`, `action`, `can`, `ok`, `error`, `preview`, and `blocked`
  - scoped calls inject `_serviceKey` and `_serviceActor`
  - unscoped calls stay clean
  - destructive preview/confirm flow works

### 5. Resource Loader + Permissions

- Test module: `playground/convex/experiments/v2_functions.ts`
- Test file: `playground/convex/v2-experiments.test.ts`
- Verified:
  - member can update own post
  - member cannot update another member's post in the same org
  - admin can update any post in the org
  - deleted-but-valid IDs produce `Resource not found.`
  - cross-org access produces `Document belongs to a different organization.`
  - explicit cross-table loading (`{ table: 'posts', id: args.postId }`) works for ownership checks

---

## Current Conclusion

The v2 contract is viable. The repo now has runnable experiments for the critical claims without forcing a public API cutover yet.

The remaining work is implementation, not architecture discovery:

1. Move the experimental builder/resource pipeline into the public runtime.
2. Replace the current shared-schema API with the v2 single-definition shape.
3. Replace the current MCP factory surface with the v2 one-import, one-ctx API.
