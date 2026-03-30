import { v } from 'convex/values'
import { describe, expect, it } from 'vitest'

import { defineArgs } from '../../src/runtime/schema'
import { validateConvex } from '../../src/runtime/utils/convex-schema'

describe('defineArgs service-auth compatibility', () => {
  it('keeps public validators clean while widening convexValidators for hidden service auth', () => {
    const createThing = defineArgs({
      description: 'Create a thing',
      args: {
        title: v.string(),
      },
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
