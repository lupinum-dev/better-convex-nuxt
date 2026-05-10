# trellis-starter-workspace

Generated with `trellis init trellis-starter-workspace --template workspace`.

## Quick start

```bash
pnpm install
pnpm convex:dev
pnpm dev
```

## Canonical shape

- `convex/features/` for backend feature modules
- `shared/features/` for runtime-neutral contracts
- `convex/auth/` for actor and guard logic
- `convex/permissions/` for permission projection when the starter uses permission context
- `app/features/` for feature-owned UI and route shells

## Maintained reference

- Start with the maintained reference: [`03-team-workspace`](https://github.com/lupinum-dev/trellis/tree/main/examples/03-team-workspace).
