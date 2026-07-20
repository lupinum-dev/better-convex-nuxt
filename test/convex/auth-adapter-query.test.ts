/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { componentsGeneric, defineSchema } from 'convex/server'
import { describe, expect, it } from 'vitest'

import type { ComponentApi } from '../../src/runtime/convex-auth/component/_generated/component'
import authSchema from '../../src/runtime/convex-auth/component/schema'

const rootModules = import.meta.glob('../fixtures/jwks-rotation/convex/**/*.ts')
const authModules = import.meta.glob('../../src/runtime/convex-auth/component/**/*.ts')
const rootSchema = defineSchema({})
const components = componentsGeneric() as unknown as {
  authQuery: ComponentApi<'authQuery'>
}
const auth = components.authQuery.adapter

function initAuthQueryTest() {
  const test = convexTest(rootSchema, rootModules)
  test.registerComponent('authQuery', authSchema, authModules)
  return test
}

describe('Convex auth adapter ordered queries', () => {
  it('uses the identifier + createdAt index for isolated final-factor verification lookup', async () => {
    const test = initAuthQueryTest()
    const rows = [
      { createdAt: 100, id: 'a-old', identifier: 'mfa:a' },
      { createdAt: 300, id: 'b-only', identifier: 'mfa:b' },
      { createdAt: 200, id: 'a-new', identifier: 'mfa:a' },
    ]
    for (const row of rows) {
      await test.mutation(auth.create, {
        data: {
          ...row,
          expiresAt: 10_000,
          updatedAt: row.createdAt,
          value: `value-${row.id}`,
        },
        model: 'verification',
      })
    }

    const result = await test.query(auth.findMany, {
      model: 'verification',
      paginationOpts: { cursor: null, numItems: 10 },
      sortBy: { direction: 'desc', field: 'createdAt' },
      where: [{ field: 'identifier', value: 'mfa:a' }],
    })

    expect(result.page.map((row) => row.id)).toEqual(['a-new', 'a-old'])
    expect(result.isDone).toBe(true)
  })
})
