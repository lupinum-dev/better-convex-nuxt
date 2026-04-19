import { v } from 'convex/values'
import { describe, expect, it } from 'vitest'

import { validateConvex } from '../../src/runtime/convex/shared/convex-schema'
import { defineArgs } from '../../src/runtime/schema'

describe('defineArgs', () => {
  it('keeps shared args as the only validator surface', () => {
    const createThing = defineArgs({
      description: 'Create a thing',
      args: {
        title: v.string(),
      },
    })

    expect(Object.keys(createThing.args)).toEqual(['title'])
    expect(validateConvex(v.object(createThing.args), { title: 'Hello' })).toEqual([])
  })
})
