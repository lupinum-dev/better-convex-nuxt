# Example 08: Component Mini CMS

This is the canonical Trellis example for a **local Convex component** plus **MCP projection**.

It is intentionally a small slice of the `ginko-cms` architecture:

- the browser talks to root Convex wrappers
- the root app resolves the caller principal
- the local component owns page business logic and authorization
- MCP tools project root internal bridge refs instead of duplicating behavior

This example is local-only. It does **not** cover packaged-component publishing or NPM package
authoring, but it is the direct architectural precursor to the packaged `ginko-cms` flow.

## What it demonstrates

- a local Convex component mounted in `convex/convex.config.ts`
- principal-first auth across browser, root Convex, component, and MCP
- app-owned bridge inventory with `createComponentBridge(...)`
- a tiny draft/save/publish flow with one public read surface
- destructive MCP preview for `publish-page`

## Files to read first

If you want the architecture in one pass, read these four files in order:

1. `convex/components/miniCms/pages.ts`
2. `convex/miniCmsBridge.ts`
3. `server/lib/mcp-runtime.ts`
4. `pages/studio.vue`

## Running the example

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

You need the usual local Convex env values plus a demo MCP bearer token:

- `BETTER_AUTH_SECRET`
- `SITE_URL`
- `CONVEX_TRUSTED_CALLER_KEY`
- `DEMO_MCP_TOKEN`

The studio page shows the exact `Authorization: Bearer ...` header to use with the local MCP
endpoint.

## Scope boundaries

Use this example when you want to understand:

- local component boundaries
- principal forwarding
- root app wrappers versus component business logic
- `projectTool(...)` over internal bridge refs

Use [`07-mcp-reference`](../07-mcp-reference/README.md) when you want the full MCP protocol
surface, key management, resources, and prompts.

Use `ginko-cms` when you want the publishable packaged-component version of this architecture.

Use the Trellis package-component docs when you want the manifest-driven host bridge workflow:

- package exports `convex/manifest`
- host runs `trellis bridge generate <package>`
- module validates generated bridge files instead of patching host code at runtime
