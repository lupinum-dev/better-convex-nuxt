import { v } from 'convex/values'
import { describe, expect, it } from 'vitest'

import { defineArgs } from '../../src/runtime/schema'
import { validateConvex } from '../../src/runtime/utils/convex-schema'

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
