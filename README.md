# Trellis

Trellis is an opinionated app platform for repeated `Nuxt + Convex + Better Auth + MCP` apps on one backend model.

It is not a neutral helper layer. It is the hard-default path when you want the same runtime model reused across browser UI, Nitro routes, trusted forwarding, and MCP tools without re-solving auth, permissions, tenancy, and destructive-work safety in every app.

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

- [Documentation](https://trellis.vercel.app)
- [Examples](./examples/README.md)
- [Spec](./meta/SPEC-FINAL.md)

## Good Fit

Use Trellis when:

- the app is on Nuxt + Convex + Better Auth already
- you need one protected backend model reused across browser UI, Nitro routes, and MCP
- tenant isolation, roles, permission projection, or destructive-work safety are real product requirements
- you want starters, generators, examples, lint rules, and `doctor` to reinforce one framework shape

## Not Ideal

Do not start here when:

- the app is a tiny public or one-off internal tool and raw Convex is already enough
- you want an unopinionated helper layer instead of a framework
- you are not willing to keep the canonical app shape and feature layout
- you do not need shared auth, permission, or MCP conventions across surfaces

## Official Product Surface

Canonical CLI:

```bash
npx trellis init my-app --template public
npx trellis init my-app --template personal
npx trellis init my-app --template workspace --mcp
npx trellis add entity project
npx trellis add uploads
npx trellis add operation publish-entry --kind destructive
npx trellis doctor
```

Official starters:

- `public`
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

The rule is simple: keep the generated shell and add product code under feature folders instead of inventing a new shape per project.

Treat each top-level feature component as a mini-Trellis boundary: routes stay thin, and the feature component owns the query/mutation/permission seam for that slice.

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
- Forwarded `principal` values are only accepted on verified trusted-forwarding paths.
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

Read `01 → 02 → 03` as the ladder.

- `03-team-workspace` is the canonical protected workspace reference.
- `04–06` are maintained pattern catalogs for deeper app boundaries.
- `07-mcp-reference` is the maintained agent/MCP reference.
- `08-component-mini-cms` is a maintained boundary/reference app, not a general starter.

`labs/` is not part of the canonical public learning path. Today it is:

- archived and exploratory material that may inform future example families
- a set of concept briefs and legacy inputs, not maintained public references

Future starter families are intentionally not promised until they ship. The public Trellis contract today is still the three starters plus optional MCP on `workspace`.

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
