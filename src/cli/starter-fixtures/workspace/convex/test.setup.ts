/// <reference types="vite/client" />

import { createConvexTestModules } from '@lupinum/trellis/testing'

export const modules = createConvexTestModules(
  import.meta.glob('./**/*.ts', {
    eager: false,
  }),
)
