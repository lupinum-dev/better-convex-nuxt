/// <reference types="vite/client" />

import rateLimiter from '@convex-dev/rate-limiter/test'
import { convexTest } from 'convex-test'

import schema from './schema'

export const modules = import.meta.glob('./**/*.ts', {
  eager: false,
})

export function initConvexTest() {
  const t = convexTest(schema, modules)
  rateLimiter.register(t)
  return t
}
