This folder exists because files here are imported by both `convex/` and Nuxt code.

Keep shared files runtime-neutral:

- no Nuxt-only APIs
- no browser-only APIs
- no assumptions about `ctx`, `event`, or Vue component state
