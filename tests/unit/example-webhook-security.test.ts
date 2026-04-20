import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../..')

describe('example webhook security posture', () => {
  it('uses a constant-time signature comparison in the webhook example', () => {
    const source = readFileSync(
      resolve(repoRoot, 'examples/03-team-workspace/server/api/webhook.post.ts'),
      'utf8',
    )
    const helper = readFileSync(resolve(repoRoot, 'src/runtime/server/webhooks.ts'), 'utf8')

    expect(source).toContain('isWebhookSignatureValid')
    expect(source).not.toContain('signature !== getWebhookSecret()')
    expect(helper).toContain('timingSafeEqual')
  })
})
