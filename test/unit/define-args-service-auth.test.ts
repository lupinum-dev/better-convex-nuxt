import { v } from 'convex/values'
import { describe, expect, it } from 'vitest'

import { defineArgs } from '../../src/runtime/schema'
import { validateConvex } from '../../src/runtime/utils/convex-schema'

describe('defineArgs service-auth compatibility', () => {
  it('convexValidators equals validators by default (no service auth fields)', () => {
    const createThing = defineArgs({
      description: 'Create a thing',
      args: {
        title: v.string(),
      },
    })

    expect(Object.keys(createThing.validators)).toEqual(['title'])
    expect(Object.keys(createThing.convexValidators)).toEqual(['title'])
  })

  it('widens convexValidators with service auth fields when serviceAuth is true', () => {
    const createThing = defineArgs({
      description: 'Create a thing',
      args: {
        title: v.string(),
      },
      serviceAuth: true,
    })

    expect(Object.keys(createThing.validators)).toEqual(['title'])
    expect(Object.keys(createThing.convexValidators)).toEqual([
      'title',
      '_serviceKey',
      '_serviceActor',
    ])

    const issues = validateConvex(v.object(createThing.convexValidators), {
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
