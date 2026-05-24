# trellis-starter-workspace

Generated with `trellis init trellis-starter-workspace --template workspace`.

## Quick start

```bash
pnpm install
pnpm dev:local
```

Use `pnpm convex:dev` and `pnpm dev` when you want to connect to a hosted Convex dev deployment.

## Canonical shape

- `convex/features/` for backend feature modules
- `shared/features/` for runtime-neutral contracts
- `convex/auth/` for appIdentity and guard logic
- `convex/permissions/` for permission projection when the starter uses access context
- `app/features/` for feature-owned UI and route shells

## Maintained reference

- Start with the maintained reference: [`03-team-workspace`](https://github.com/lupinum-dev/trellis/tree/main/examples/03-team-workspace).
