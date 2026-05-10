# trellis-starter-public

Generated with `trellis init trellis-starter-public --template public`.

## Quick start

```bash
pnpm install
pnpm convex:dev
pnpm dev
```

## Canonical shape

- `convex/features/` for backend feature modules
- `shared/features/` for runtime-neutral contracts
- `convex/auth/` for actor and guard logic (not used in the public starter)
- `convex/permissions/` for permission projection when the starter uses permission context
- `app/features/` for feature-owned UI and route shells

## Maintained reference

- Start with the maintained reference: [`01-public-todo`](https://github.com/lupinum-dev/trellis/tree/main/examples/01-public-todo).
