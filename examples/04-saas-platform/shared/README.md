# Shared folder

This example keeps runtime-neutral feature contracts in `shared/features/*`.

Use this folder only for artifacts that both runtimes import directly:

- `convex/` files run on Convex's infrastructure
- `server/` files run in Nitro on the Nuxt side

Default rule: every feature owns `shared/features/<name>/contract.ts`.

Do not turn `shared/` into a general dumping ground:

- no Vue imports
- no Nuxt imports
- no Convex server imports
- no browser-only APIs
