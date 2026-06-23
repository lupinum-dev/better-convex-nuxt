/// <reference types="vite/client" />

import { convexTest } from 'convex-test'

import betterAuthSchema from './betterAuth/schema'
import schema from './schema'

process.env.SITE_URL ??= 'http://localhost:3000'
process.env.BETTER_AUTH_SECRET ??= 'convex-test-secret'

export const modules = import.meta.glob('./**/*.ts', {
  eager: false,
})

const betterAuthModules = import.meta.glob('./betterAuth/**/*.ts')

export function initConvexTest() {
  const t = convexTest(schema, modules)
  t.registerComponent('betterAuth', betterAuthSchema, betterAuthModules)
  return t
}
