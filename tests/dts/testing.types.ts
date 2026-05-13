import { createTestContext } from '@lupinum/trellis/testing'
import { expectTypeOf } from 'vitest'

const testContext = createTestContext({ schema: {} as never })

expectTypeOf(testContext).toHaveProperty('seed')
expectTypeOf(testContext).toHaveProperty('asCaller')
