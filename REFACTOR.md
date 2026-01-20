# Complexity Notes

High-complexity or messy areas identified during a quick scan:

- `src/runtime/composables/useConvexPaginatedQuery.ts`: Large (≈1k lines) with interleaved SSR/client logic, caching, subscriptions, and control flow branching. Hard to reason about state transitions and error handling.
- `src/runtime/composables/optimistic-updates.ts`: Dense helper collection for optimistic updates with many generic types and repeated iteration logic. Potential for shared helper extraction or clearer grouping.
- `src/runtime/utils/logger.ts`: Large formatting logic for ANSI + browser logging, multiple event types, and inline styling data. Could benefit from modularization and shared formatting utilities.
- `src/runtime/server/api/auth/[...].ts`: CORS, proxying, and auth routing logic in a single handler with multiple responsibilities and branching paths.
- `src/module.ts`: Central module setup with many responsibilities (config validation, runtime config merge, imports, server handlers, devtools setup) in one file.
