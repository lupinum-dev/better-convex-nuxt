// Simulates the module-generated declaration registered via Nuxt Kit
// `addTypeTemplate` (vNext §8 "Generated type registry"). In Phase 3 this exact
// shape is produced by src/module.ts from the resolved definition path; here it
// is committed so `nuxi typecheck` sees the registered definition.
//
// The real template's `getContents` emits:
//   import type definition from <resolvedAuthClientDefinitionPath>
//   declare module 'better-convex-nuxt' { interface ConvexAuthClientRegistry { definition: typeof definition } }
// The prototype `/auth-client` entry hosts `ConvexAuthClientRegistry`, so the
// augmentation targets that module here.
import type definition from '../convex-auth'

declare module 'better-convex-nuxt/auth-client' {
  interface ConvexAuthClientRegistry {
    definition: typeof definition
  }
}
