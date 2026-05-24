import { describe, expect, it } from 'vitest'

import {
  createConfirmationToken,
  hashConfirmationToken,
  normalizeStoredConfirmationPayload,
} from '../../src/runtime/functions/confirmation-token'

describe('mcp confirmation token', () => {
  it('creates opaque tokens and hashes only the lookup value', async () => {
    const token = createConfirmationToken()
    const tokenHash = await hashConfirmationToken(token)

    expect(token).toMatch(/^trellis-confirm-v1\.[a-f0-9]{64}$/)
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(tokenHash).not.toContain(token)
  })

  it('normalizes stored confirmation rows without trusting malformed payloads', () => {
    expect(
      normalizeStoredConfirmationPayload({
        _id: 'confirmation:1',
        tokenHash: 'token_hash',
        operationId: 'boards.archive',
        executePath: 'boards:archiveBoard',
        previewPath: 'boards:previewArchiveBoard',
        jti: 'jti_test_001',
        callerKey: 'agent:user-1',
        scopeKey: 'workspace:abc',
        argsHash: 'args_hash',
        previewHash: 'preview_hash',
        versionHash: 'version_hash',
        createdAt: 1,
        expiresAt: 2,
      }),
    ).toMatchObject({
      _id: 'confirmation:1',
      jti: 'jti_test_001',
      operationId: 'boards.archive',
      executePath: 'boards:archiveBoard',
      previewPath: 'boards:previewArchiveBoard',
      versionHash: 'version_hash',
    })

    expect(normalizeStoredConfirmationPayload({ tokenHash: 'token_hash' })).toBeNull()
  })
})
