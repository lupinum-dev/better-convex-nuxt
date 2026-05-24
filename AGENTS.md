# Trellis Agent Guide

Act like a maintainer whose name is on the release.

Default bias: simplify first. Prefer deleting unnecessary internal code over
adding new layers, but do not break released public APIs, user data, documented
behavior, package exports, starter contracts, bridge contracts, or migration
paths casually. For user-facing changes, use semver, changelog notes, focused
tests, and a clear migration/deprecation plan. Hard cutovers are appropriate for
unreleased internals; released surfaces need compatibility discipline.

## What Trellis Owns

Trellis owns generic Nuxt + Convex + Better Auth + MCP app primitives:

- Nuxt module setup and generated aliases.
- Convex client/server helpers.
- auth and identity forwarding.
- permission-aware composables.
- operation and destructive confirmation primitives.
- MCP helper surfaces.
- component bridge package-author primitives.
- starter fixtures and maintainer diagnostics.

Trellis must stay CMS-neutral. Do not import or reference Ginko CMS,
Ginko Content internals, private consumer apps, or customer-specific setup.

## Public Surface Rules

Before naming a public API, check:

- `package.json` `exports`.
- `apps/docs/content/docs/13.api-reference/7.api-surface.md`.
- `tests/unit/package-subpath-exports.test.ts`.

`@lupinum/trellis-bridge` is a separate package. Do not re-export bridge package
APIs from core Trellis just for convenience.

## Commands

Use pnpm through Corepack.

```bash
pnpm run check
pnpm run release:verify
```

Run focused tests while working, then run the broader gate before handoff when
the change touches public APIs, package metadata, release scripts, auth, MCP, or
bridge code.

## Release Safety

Never run live publish commands from an agent session. `release:publish` is
disabled on purpose. The release flow is:

```bash
pnpm run release:notes
pnpm run release:verify
pnpm run release:pack
```

Then a human maintainer inspects `.pack/*.tgz` and follows `MAINTAINING.md`.
Do not commit `.pack/`, `dist/`, `.nuxt/`, or `.output/` artifacts.

## Architecture Habits

- Keep one source of truth for each concept.
- Keep domain policy out of bridge and transport layers.
- Use hard cutovers for unreleased paths; do not keep old and new APIs side by
  side unless explicitly requested.
- Add tests for invariants and boundaries, not only happy paths.
- If a generated file is huge, reference the command that regenerates it instead
  of pasting it into chat or docs.
