import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../..')

describe('example webhook security posture', () => {
  it('routes examples through the shared verified-webhook helper', () => {
    const sources = [
      resolve(repoRoot, 'examples/03-team-workspace/server/api/webhook.post.ts'),
      resolve(repoRoot, 'examples/04-saas-platform/server/api/webhook.post.ts'),
      resolve(repoRoot, 'examples/07-mcp-reference/server/api/runbook-webhook.post.ts'),
    ].map((file) => readFileSync(file, 'utf8'))
    const helper = readFileSync(resolve(repoRoot, 'src/runtime/server/webhooks.ts'), 'utf8')

    for (const source of sources) {
      expect(source).toContain('readSharedSecretWebhookBody')
      expect(source).not.toContain('signature !== getWebhookSecret()')
    }
    expect(helper).toContain('timingSafeEqual')
  })
})
