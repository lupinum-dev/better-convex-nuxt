# Complexity Notes

High-complexity or messy areas identified during a quick scan:

- `src/runtime/composables/useConvexPaginatedQuery.ts`: Large (≈1k lines) with interleaved SSR/client logic, caching, subscriptions, and control flow branching. Hard to reason about state transitions and error handling.
- `src/runtime/composables/optimistic-updates.ts`: Dense helper collection for optimistic updates with many generic types and repeated iteration logic. Potential for shared helper extraction or clearer grouping.
- `src/runtime/utils/logger.ts`: Large formatting logic for ANSI + browser logging, multiple event types, and inline styling data. Could benefit from modularization and shared formatting utilities.
- `src/runtime/server/api/auth/[...].ts`: CORS, proxying, and auth routing logic in a single handler with multiple responsibilities and branching paths.
- `src/module.ts`: Central module setup with many responsibilities (config validation, runtime config merge, imports, server handlers, devtools setup) in one file.

## Proposed Refactor Plan (Ordered)

1. Split `src/runtime/composables/useConvexPaginatedQuery.ts` into state machine, cache/subscription, and SSR/client adapters with clear interfaces.
2. Extract shared iteration and merge helpers from `src/runtime/composables/optimistic-updates.ts`, then regroup exports by responsibility.
3. Modularize `src/runtime/utils/logger.ts` into formatters (ANSI/browser), event serializers, and public logging API.
4. Decompose `src/runtime/server/api/auth/[...].ts` into CORS/proxy/auth routing helpers, then wrap them in a thin handler.
5. Slice `src/module.ts` into setup phases (config validation, runtime config merge, handlers/devtools) with explicit orchestration.

## Refactor Summary

- Simplified Convex server logging selection by mapping operation types to handlers, reducing branching.
- Streamlined subscription cache initialization to avoid repeated WeakMap lookups.

## Risk Areas

- Convex server logging routing for query/mutation/action events.

## Suggested Validation

- `npm run test`
