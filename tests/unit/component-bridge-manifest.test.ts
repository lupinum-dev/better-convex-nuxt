import { describe, expect, it } from 'vitest'

import {
  resolveConvexAppBinding,
  stripBridgeManagedBlock,
} from '../../src/runtime/functions/component-bridge-manifest'

describe('component bridge manifest helpers', () => {
  it('prefers better-auth registration as the app insertion anchor', () => {
    const source = `
import betterAuth from '@convex-dev/better-auth/convex.config'
import { defineApp } from 'convex/server'

const cmsApp = defineApp()

cmsApp.use(betterAuth, {
  name: 'betterAuth',
})
`

    const binding = resolveConvexAppBinding(source)

    expect(binding).toMatchObject({
      appName: 'cmsApp',
      anchorKind: 'betterAuth',
    })
    expect(binding?.anchorText).toContain("name: 'betterAuth'")
  })

  it('falls back to multiline defineApp bindings when better-auth is absent', () => {
    const source = `
import { defineApp } from 'convex/server'

const aliasedApp =
  defineApp()

export default aliasedApp
`

    expect(resolveConvexAppBinding(source)).toMatchObject({
      appName: 'aliasedApp',
      anchorKind: 'defineApp',
    })
  })

  it('removes existing managed blocks by package and key', () => {
    const source = `
const app = defineApp()

// @trellis-managed-start: @example/component convex-component
app.use(component)
// @trellis-managed-end: @example/component convex-component

export default app
`

    expect(
      stripBridgeManagedBlock(source, {
        packageName: '@example/component',
        key: 'convex-component',
      }),
    ).not.toContain('app.use(component)')
  })
})
