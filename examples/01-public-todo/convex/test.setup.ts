/// <reference types="vite/client" />

import { convexServerMock, createConvexTestModules } from '@lupinum/trellis/testing'
import { vi } from 'vitest'

export const modules = createConvexTestModules(
  import.meta.glob('./**/*.ts', {
    eager: false,
  }),
)

vi.mock('./_generated/server', async () => await convexServerMock())
