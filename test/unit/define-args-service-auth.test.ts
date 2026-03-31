import { v } from 'convex/values'
import { describe, expect, it } from 'vitest'

import { defineArgs } from '../../src/runtime/schema'
import { validateConvex } from '../../src/runtime/utils/convex-schema'

describe('defineArgs service-auth compatibility', () => {
  it('fullArgs equals args by default (no service auth fields)', () => {
    const createThing = defineArgs({
      description: 'Create a thing',
      args: {
        title: v.string(),
      },
    })

    expect(Object.keys(createThing.args)).toEqual(['title'])
    expect(Object.keys(createThing.fullArgs)).toEqual(['title'])
  })

  it('widens fullArgs with service auth fields when serviceAuth is true', () => {
    const createThing = defineArgs({
      description: 'Create a thing',
      args: {
        title: v.string(),
      },
      serviceAuth: true,
    })

    expect(Object.keys(createThing.args)).toEqual(['title'])
    expect(Object.keys(createThing.fullArgs)).toEqual([
      'title',
      '_serviceKey',
      '_serviceActor',
    ])

    const issues = validateConvex(v.object(createThing.fullArgs), {
      title: 'Hello',
      _serviceKey: 'service-key',
      _serviceActor: {
        userId: 'alice',
        role: 'admin',
        tenantId: 'ws1',
      },
    })

    expect(issues).toEqual([])
  })
})
