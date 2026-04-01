# MCP Verification Checklist

Last updated: 2026-04-01

## Status Legend

- `TODO`
- `IN PROGRESS`
- `DONE`
- `BLOCKED`

## Core Verification

- `DONE` Fix playground build/start blockers.
- `DONE` Start local Convex + Nuxt playground successfully.
- `DONE` Verify `/mcp` initializes and returns an MCP session id.
- `DONE` Verify anonymous `tools/list` only exposes public tools.
- `DONE` Verify authenticated `tools/list` exposes role-appropriate tools.
- `DONE` Verify `check`-denied tools are hidden from discovery.
- `DONE` Verify `scoped: true` tools are hidden when `tenantId` is missing.
- `DONE` Verify direct denied tool execution is rejected.
- `DONE` Verify session-backed tools persist state across calls.
- `DONE` Verify dynamic per-session tool registration/removal works.
- `DONE` Verify prompt example is discoverable/readable.
- `DONE` Verify resource example is discoverable/readable.
- `DONE` Verify code-mode handler endpoint is registered and reachable.

## Automated Checks

- `DONE` Unit MCP tests pass.
- `DONE` MCP smoke e2e test passes.
- `DONE` Evalite MCP evals pass.
- `DONE` Typecheck remaining failures are proven unrelated to MCP changes.

## Known Issues / Notes

- Fixed: playground build failed on `createAuth` auto-import resolution in `playground/composables/usePermissions.ts`.
- Fixed: MCP auth middleware was not mapping `tenantId` onto the MCP actor, which hid scoped tools from valid actors.
- Fixed: service-auth MCP calls were only injecting `_serviceKey` and `_serviceActor` for scoped tools, causing execution/discovery drift for authenticated non-scoped tools.
- Fixed: Convex actor resolution ignored `_serviceKey` and `_serviceActor`, so MCP-authenticated calls did not reach Convex with the intended actor identity.
- Fixed: Evalite was not discovering `.eval.ts` files because the repo Vitest config had no eval project and the CLI script was using the wrong subcommand.
- Fixed: Evalite now targets the running playground server directly and auto-detects `localhost:3001` or `localhost:3000`, which avoids brittle Nuxt test-context coupling.
- Proven unrelated typecheck failures remain in:
  - `src/runtime/composables/useConvexAuthActions.ts`
  - `test/nuxt/useConvexAuthFlow.nuxt.test.ts`
  - `test/unit/example-dev-launcher.test.ts`
- Known warning: local Convex reset logs a Better Auth `passkey` cleanup validation warning during `testing.clearAllData`, but verification still completes successfully.
- Known bug: stopping the Nuxt dev server can recurse inside the MCP SDK teardown and throw `Maximum call stack size exceeded`.
