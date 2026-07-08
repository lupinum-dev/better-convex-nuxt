// F-22 fixture: pins the `ConvexUser` module-augmentation recipe
// (docs/content/docs/7.recipes/3.user-augmentation.md). If any hop in the
// module's ConvexUser re-export chain stops being a named interface re-export,
// this augmentation no longer merges and the probe in
// composables/useConvexUserAugmentationContract.ts fails `check:consumer-smoke`.
declare module 'better-convex-nuxt' {
  interface ConvexUser {
    auditProbeField?: 'yes'
  }
}

export {}
