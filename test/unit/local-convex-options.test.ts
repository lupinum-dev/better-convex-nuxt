import { describe, expect, it } from 'vitest'

import { ensureLocalConvex } from '../helpers/local-convex'

describe('local Convex deployment environment options', () => {
  it.each([
    ['a record', []],
    ['valid names', { lowercase: 'value' }],
    ['harness-owned values', { SITE_URL: 'https://example.test' }],
    [
      'at most 16 entries',
      Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`E_${i}`, 'x'])),
    ],
    ['string values', { TEST_VALUE: 42 }],
    ['non-empty values', { TEST_VALUE: '' }],
    ['bounded values', { TEST_VALUE: 'x'.repeat(4097) }],
    ['NUL-free values', { TEST_VALUE: 'secret\0suffix' }],
  ] as const)('requires deploymentEnv to contain %s', async (_label, deploymentEnv) => {
    await expect(
      ensureLocalConvex({
        deploymentEnv: deploymentEnv as unknown as Readonly<Record<string, string>>,
      }),
    ).rejects.toThrow(/deploymentEnv|deployment environment/iu)
  })

  it('does not disclose rejected deployment environment values', async () => {
    const rejectedValue = `do-not-disclose-${'x'.repeat(4097)}`

    await expect(
      ensureLocalConvex({ deploymentEnv: { TEST_SECRET: rejectedValue } }),
    ).rejects.not.toThrow(rejectedValue)
  })
})
