# Complexity Notes

High-complexity or messy areas identified during the repo scan:

- `src/runtime/composables/useConvexPaginatedQuery.ts`: Very large (~1k lines) and blends SSR/client behavior, pagination state, cache keys, and subscription lifecycle in one flow, making state transitions hard to follow.
- `src/runtime/composables/useConvexQuery.ts`: Mixes SSR fetching, WebSocket subscription management, cache ref-counting, and DevTools integration with custom pending/status behavior.
- `src/runtime/server/api/auth/[...].ts`: Single handler handles CORS validation, proxying, header forwarding, and dev logging with many branching paths.
- `src/runtime/utils/logger.ts`: Monolithic logging implementation with duplicated ANSI/browser formatting logic and large switch-based event handling.
- `src/module.ts`: Central module setup combines config validation, runtime config merge, auto-import registration, server handlers, and DevTools wiring.
- `src/runtime/devtools/server.ts`: Custom static server that mixes API endpoints, fallback HTML, path traversal checks, and MIME handling in one file.
