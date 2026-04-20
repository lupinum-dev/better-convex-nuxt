# Shared folder

This example keeps `shared/schemas/` outside both `convex/` and `server/` on purpose.

Use this folder for edge-facing schemas and DTOs that need to stay importable from both runtimes:

- `convex/` files run on Convex's infrastructure
- `server/` files run in Nitro on the Nuxt side

Keep backend-only enforcement in Convex validators and keep HTTP/form validation concerns here. Avoid runtime-specific code in this folder.
