# Shared folder

This example keeps `shared/schemas/` outside both `convex/` and `server/` on purpose.

Those files are imported from both runtimes:

- `convex/` files run on Convex's infrastructure
- `server/` files run in Nitro on the Nuxt side

Keeping the args definitions here makes that boundary visible. Avoid runtime-specific code in this folder.
