import { describe, expect, it } from 'vitest'

import {
  signConfirmationToken,
  verifyConfirmationToken,
} from '../../src/runtime/functions/confirmation-token'

describe('mcp confirmation token', () => {
  it('round-trips jti in the signed payload', async () => {
    process.env.TRELLIS_MCP_CONFIRMATION_KEY = 'test-mcp-confirmation-key'

    const token = await signConfirmationToken({
      v: 1,
      operationId: 'boards.archive',
      executePath: 'boards:archiveBoard',
      previewPath: 'boards:previewArchiveBoard',
      jti: 'jti_test_001',
      callerKey: 'agent:user-1',
      scopeKey: 'workspace:abc',
      argsHash: 'args_hash',
      previewHash: 'preview_hash',
      versionHash: 'version_hash',
    })

    await expect(verifyConfirmationToken(token)).resolves.toMatchObject({
      jti: 'jti_test_001',
      operationId: 'boards.archive',
      executePath: 'boards:archiveBoard',
      previewPath: 'boards:previewArchiveBoard',
      versionHash: 'version_hash',
    })
  })
})
