This folder exists because both `convex/` and Nuxt `app/` files import from it.

Default rule: every feature owns `shared/features/<name>/contract.ts`.

Keep files here runtime-neutral so they can be bundled by both systems without surprises.
