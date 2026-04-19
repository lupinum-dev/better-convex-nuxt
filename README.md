# Trellis

Trellis is an opinionated app platform for repeated `Nuxt + Convex + Better Auth + MCP` apps on one backend model.

It is not a neutral helper layer. It is the hard-default path when you want the same runtime model reused across browser UI, Nitro routes, trusted callers, and MCP tools without re-solving auth, permissions, tenancy, and destructive-work safety in every app.

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

- [Documentation](https://trellis.vercel.app)
- [Examples](./examples/README.md)
- [Spec](./SPEC-FINAL.md)

## Official Product Surface

Canonical CLI:

```bash
npx trellis init my-app --template personal
npx trellis init my-app --template workspace --mcp
npx trellis add resource project
npx trellis add uploads
npx trellis add operation publish-entry --kind destructive
npx trellis doctor
```

Official starters:

- `personal`
- `workspace`
- `cms`

MCP is a capability added to `workspace`, not a separate starter.

## Canonical Shape

Generated apps converge on this layout:

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
  domain/
  operations/
  permissions/
shared/
  schemas/
pages/
server/
  api/
  mcp/
```

The rule is simple: keep the generated shape. Add app code into the existing lanes instead of inventing a new structure per project.

## Runtime Contract

Trellis keeps one protected backend path:

1. principal
2. actor
3. guard
4. load
5. authorize
6. handler
7. observe

The same business model is then projected into browser UI, server callers, and MCP tools.

Key invariants:

- Tenant-aware apps use runtime-enforced isolation, not naming convention alone.
- Forwarded `principal` values are only accepted on verified trusted-caller lanes.
- Observability metadata does not participate in client query cache identity.
- Destructive first-party handlers are allowed.
- Cross-surface destructive flows, especially MCP, must use operation-backed preview/confirm/execute.

## Examples

Recommended reading order:

1. [`examples/01-public-todo`](./examples/01-public-todo/README.md)
2. [`examples/02-auth-todo`](./examples/02-auth-todo/README.md)
3. [`examples/03-team-workspace`](./examples/03-team-workspace/README.md)
4. [`examples/04-saas-platform`](./examples/04-saas-platform/README.md)
5. [`examples/05-visibility-access`](./examples/05-visibility-access/README.md)
6. [`examples/06-multi-workspace`](./examples/06-multi-workspace/README.md)
7. [`examples/07-mcp-reference`](./examples/07-mcp-reference/README.md)
8. [`examples/08-component-mini-cms`](./examples/08-component-mini-cms/README.md)

Read `01 → 02 → 03` as the ladder. Treat `04+` as pattern catalogs you open once you know which boundary you actually need.

`examples-next` is a pressure suite and roadmap workspace, not the default public product surface.

## Roadmap, Not Product

These shapes are not first-class starters in the current product:

- `support-inbox`
- `admin-console`
- `agent-console`

They remain directionally important, but the public Trellis contract is the three shipped starters plus optional MCP.

## Contributing

```bash
corepack pnpm install
pnpm dev
```

[npm-version-src]: https://img.shields.io/npm/v/@lupinum/trellis/latest.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-version-href]: https://npmjs.com/package/@lupinum/trellis
[npm-downloads-src]: https://img.shields.io/npm/dm/@lupinum/trellis.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-downloads-href]: https://npm.chart.dev/@lupinum/trellis
[license-src]: https://img.shields.io/npm/l/@lupinum/trellis.svg?style=flat&colorA=18181B&colorB=28CF8D
[license-href]: https://npmjs.com/package/@lupinum/trellis
[nuxt-src]: https://img.shields.io/badge/Nuxt-4.x-00DC82?style=flat&logo=nuxt.js&logoColor=white
[nuxt-href]: https://nuxt.com
