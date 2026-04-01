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
- `DONE` Auth explicit trusted-caller cutover passes unit tests.
- `DONE` Stub package build exposes the new auth surface (`withTrustedCaller`, `getTrustedCaller`).
- `DONE` Playground Convex tests still pass after removing `actorQuery` / `actorMutation`.

## Example 11: MCP Reference

- `DONE` Scaffold `examples/11-mcp-reference` as the canonical full MCP example.
- `DONE` Replace the copied todo domain with runbooks + hashed MCP keys.
- `DONE` Add public, scoped, destructive-preview, prompt, resource, session, dynamic-session, and code-mode MCP surfaces.
- `DONE` `pnpm test` passes in `examples/11-mcp-reference`.
- `DONE` `convex codegen --typecheck=enable` passes in `examples/11-mcp-reference`.
- `DONE` `pnpm dev` starts local Convex + Nuxt for `examples/11-mcp-reference`.
- `DONE` Public `/mcp` initialize succeeds and returns an MCP session id.
- `DONE` Public `tools/list` shows only public runbook tools plus the intentionally public session-state helpers.
- `DONE` Public session state round-trip works via `set-session-focus` and `get-session-focus`.
- `DONE` `resources/list` and `resources/read` expose `app://mcp-reference/guide`.
- `DONE` `prompts/list` and `prompts/get` expose `plan-runbook-workflow`.
- `DONE` `/mcp/runbook-agent` initializes and exposes the code-mode endpoint.
- `TODO` Live-verify the authenticated MCP key flow end to end against the running example UI.

## Known Issues / Notes

- Fixed: playground build failed on `createAuth` auto-import resolution in `playground/composables/usePermissions.ts`.
- Fixed: MCP auth middleware was not mapping `tenantId` onto the MCP actor, which hid scoped tools from valid actors.
- Fixed: service-auth MCP calls were only injecting `_serviceKey` and `_serviceActor` for scoped tools, causing execution/discovery drift for authenticated non-scoped tools.
- Fixed: Convex actor resolution ignored `_serviceKey` and `_serviceActor`, so MCP-authenticated calls did not reach Convex with the intended actor identity.
- Fixed: wrapper-based `actorQuery` / `actorMutation` auth flow was removed in favor of explicit `getActor(ctx, args)` plus `withTrustedCaller(...)`.
- Fixed: shared schemas are schema-only again; hidden trusted-caller transport no longer lives on `defineArgs()`.
- Fixed: Evalite was not discovering `.eval.ts` files because the repo Vitest config had no eval project and the CLI script was using the wrong subcommand.
- Fixed: Evalite now targets the running playground server directly and auto-detects `localhost:3001` or `localhost:3000`, which avoids brittle Nuxt test-context coupling.
- Fixed: `examples/11-mcp-reference` needed `nitro.experimental.asyncContext` enabled for `useMcpSession()`.
- Fixed: generic MCP session mutators in `examples/11-mcp-reference` were incorrectly using the Convex-specific `auth` option; they now use explicit `enabled(event)` + runtime guards.
- Proven unrelated typecheck failures remain in:
  - `src/runtime/composables/useConvexAuthActions.ts`
  - `test/nuxt/useConvexAuthFlow.nuxt.test.ts`
  - `test/unit/example-dev-launcher.test.ts`
- Known warning: local Convex reset logs a Better Auth `passkey` cleanup validation warning during `testing.clearAllData`, but verification still completes successfully.
- Known bug: stopping the Nuxt dev server can recurse inside the MCP SDK teardown and throw `Maximum call stack size exceeded`.
