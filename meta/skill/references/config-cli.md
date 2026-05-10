# Configuration And CLI

Use this for `nuxt.config.ts` module options, starter selection, `trellis init`,
`trellis add`, `trellis doctor`, and canonical app shape decisions.

## Source Files

- Module options: `src/module-internals/options.ts`.
- Module defaults/setup: `src/module.ts`, `src/module-internals/setup.ts`.
- CLI commands: `src/cli/commands/init.ts`, `src/cli/commands/add.ts`,
  `src/cli/commands/doctor.ts`.
- CLI templates: `src/cli/templates/init/**`.
- CLI template assembly: `src/cli/lib/init.ts`,
  `src/cli/lib/init-templates.ts`.
- Product overview: `README.md`.
- Canonical shape: `meta/ARCHITECTURE.md`, `meta/ABSTRACTIONS.md`,
  `meta/adr/0003-canonical-feature-folder-app-shape.md`.

## When Trellis Fits

Use Trellis when the app is Nuxt + Convex and needs one protected model reused
across browser UI, Nitro routes, trusted forwarding, and MCP. It is a framework
with hard defaults for auth, permissions, tenancy, destructive safety, examples,
generators, and doctor checks.

Do not reach for Trellis as a neutral helper layer for tiny public tools or apps
that do not need shared auth/permission/MCP conventions.

## Module Options

The Nuxt module config key is `trellis`.

Important options:

- `url`: Convex deployment URL.
- `auth`: `true`, `false`, or full auth options. `undefined` defaults to auth
  enabled.
- `permissions`: string shorthand or `{ query, codegen }`.
- `mcp`: MCP runtime options, enabled when the MCP toolkit is installed.
- `query`: defaults for `useConvexQuery` and `useConvexPaginatedQuery`.
- `upload`: upload defaults such as `maxConcurrent`.
- `observability`: semantic Trellis runtime events through evlog.
- `validation.strict`: promote startup validation warnings to errors.

Example:

```ts
export default defineNuxtConfig({
  modules: ['@lupinum/trellis'],
  trellis: {
    auth: {
      routeProtection: { redirectTo: '/auth/signin' },
    },
    permissions: 'permissions/context.getPermissionContext',
    query: { server: true, subscribe: true },
  },
})
```

Do not duplicate generated composable wiring by hand. Configure the module and
let installers create aliases, auto-imports, route middleware, auth handlers,
and permission composables.

## CLI Starters

Canonical init command:

```bash
pnpm dlx @lupinum/trellis init my-app --template public
pnpm dlx @lupinum/trellis init my-app --template personal
pnpm dlx @lupinum/trellis init my-app --template workspace
pnpm dlx @lupinum/trellis init my-app --template workspace-mcp
```

Supported templates are only:

- `public`
- `personal`
- `workspace`
- `workspace-mcp`

`workspace-mcp` is the first-class template name for the agent-enabled workspace
starter. `--mcp` remains an accepted alias with `--template workspace`.

CMS product setup is owned by Ginko, not the Trellis init surface.

Legacy `trellis init app|auth|permissions|mcp` flows are removed. Do not revive
them as compatibility paths unless explicitly requested.

## Add Commands

Canonical feature additions:

```bash
trellis add mcp
trellis add uploads
trellis add entity project
trellis add operation publish-entry --kind destructive
```

Supported `trellis add` features are:

- `mcp`
- `uploads`
- `operation`
- `entity`

Operation kind is `safe` or `destructive`.

## Canonical App Shape

Generated apps converge on the repo shape documented in `README.md`:

```text
nuxt.config.ts
convex/
  auth.ts
  auth.config.ts
  convex.config.ts
  functions.ts
  http.ts
  schema.ts
  auth/
  permissions/
  features/
shared/
  features/
app/
  features/
  pages/
server/
  api/
  mcp/
```

Keep routes thin. Put product code under feature folders. Treat feature
components as boundaries that own the query/mutation/permission seam for that
slice.

## Doctor And Validation

Use `trellis doctor` for project setup diagnostics. Use repo checks from
[testing-examples-docs.md](testing-examples-docs.md) when changing source,
templates, examples, or docs.

## Pitfalls

- Do not invent new starter families from `labs/`; labs are non-canonical until
  promoted.
- Do not let examples replace templates. Examples teach patterns; CLI templates
  scaffold productized starting points.
- Do not manually wire generated aliases or auto-imports in consumer apps unless
  the module installer is intentionally being changed.
