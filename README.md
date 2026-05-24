# Trellis

Trellis is an opinionated app framework for building reliable `Nuxt + Convex` apps with strong identity, permissions, isolation, and agent-friendly structure.

It is not a neutral helper layer. It is the hard-default path when you want the same runtime model reused across browser UI, Nitro routes, identity forwarding, and MCP tools without re-solving auth, permissions, isolation scope, and destructive-work safety in every app.

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

- [Documentation](https://trellis.vercel.app)
- [Examples](./examples/README.md)
- [Vision](./VISION.md)
- [Architecture](./ARCHITECTURE.md)
- [Abstractions](./ABSTRACTIONS.md)
- [Security](./SECURITY.md)
- [ADRs](./adr/README.md)
- [Contributing](./CONTRIBUTING.md)
- [Development](./DEVELOPMENT.md)

## Release Compatibility

The first clean public release line is:

| Package                   | Version | Audience                                                             |
| ------------------------- | ------: | -------------------------------------------------------------------- |
| `@lupinum/trellis`        | `0.4.0` | Nuxt + Convex app teams                                              |
| `@lupinum/trellis-bridge` | `0.1.0` | Package authors building Trellis-aware Convex component integrations |

`@lupinum/trellis-bridge` is not a beginner app API. Use it when you are
shipping a package that installs generated host bridge files into another app.
Normal Trellis apps should start with the module, starters, composables, server
helpers, and MCP runtime from `@lupinum/trellis`.

## Good Fit

Use Trellis when:

- the app is on Nuxt + Convex + Better Auth already
- you need one protected backend model reused across browser UI, Nitro routes, and MCP
- isolation, roles, permission projection, or destructive-work safety are real product requirements
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
pnpm dlx @lupinum/trellis init my-app --template public
pnpm dlx @lupinum/trellis init my-app --template personal
pnpm dlx @lupinum/trellis init my-app --template workspace
pnpm dlx @lupinum/trellis init my-app --template workspace-mcp
pnpm dlx @lupinum/trellis add entity project
pnpm dlx @lupinum/trellis add uploads
pnpm dlx @lupinum/trellis add operation publish-entry --kind destructive
pnpm dlx @lupinum/trellis doctor
```

After local install, the binary is `trellis`.

Official starters:

- `public`
- `personal`
- `workspace`
- `workspace-mcp`

CMS product setup is Ginko-owned. Do not install Ginko CMS through Trellis
commands, Trellis bridge exports, or starter variants. Trellis keeps
`08-component-mini-cms` as an advanced package-integration reference, not as a
beginner starter.

## Canonical Shape

Generated apps converge on this layout. Public apps omit the auth and permission folders until those capabilities are added.

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

Trellis keeps one protected backend decision path:

1. caller
2. appIdentity
3. guard
4. load
5. authorize
6. handler

The same business model is then projected into browser UI, server callers, and MCP tools.

Observation is emitted around guard, authorization, destructive-operation, MCP, and trust-boundary decisions. It is not a guaranteed final post-handler phase.

Key invariants:

- Isolation-aware apps use runtime-enforced isolation, not naming convention alone.
- Forwarded `caller` values are only accepted on verified identity-forwarding paths.
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

Read `01 -> 02 -> 03 -> 04` as the beginner ladder.

- `03-team-workspace` is the canonical protected workspace reference.
- `04-saas-platform` is the server-integration branch of that ladder.
- `05–06` are maintained pattern catalogs for deeper authorization and isolation boundaries.
- `07-mcp-reference` is the maintained agent/MCP reference.
- `08-component-mini-cms` is a maintained boundary/reference app, not a general starter.

`labs/` is not part of the canonical public learning path. Today it is:

- archived and exploratory material that may inform future example families
- a set of concept briefs and legacy inputs, not maintained public references

Future starter families are intentionally not promised until they ship. The
public Trellis contract today is the current starter set.

## Contributing

```bash
corepack pnpm install
pnpm dev
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) for the command map and contribution rules. Use [DEVELOPMENT.md](./DEVELOPMENT.md) as the local development appendix.

[npm-version-src]: https://img.shields.io/npm/v/@lupinum/trellis/latest.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-version-href]: https://npmjs.com/package/@lupinum/trellis
[npm-downloads-src]: https://img.shields.io/npm/dm/@lupinum/trellis.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-downloads-href]: https://npm.chart.dev/@lupinum/trellis
[license-src]: https://img.shields.io/npm/l/@lupinum/trellis.svg?style=flat&colorA=18181B&colorB=28CF8D
[license-href]: https://npmjs.com/package/@lupinum/trellis
[nuxt-src]: https://img.shields.io/badge/Nuxt-4.x-00DC82?style=flat&logo=nuxt.js&logoColor=white
[nuxt-href]: https://nuxt.com
