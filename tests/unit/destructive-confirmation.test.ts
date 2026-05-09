import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  hashConfirmationValue,
  signConfirmationToken,
} from '../../src/runtime/mcp/confirmation-token'
import {
  hashArgsForDiagnostics,
  verifyDestructiveConfirmationToken,
} from '../../src/runtime/mcp/destructive-confirmation'

describe('destructive confirmation diagnostics', () => {
  beforeEach(() => {
    process.env.TRELLIS_MCP_CONFIRMATION_KEY = 'test-mcp-confirmation-key'
  })

  afterEach(() => {
    delete process.env.TRELLIS_MCP_CONFIRMATION_KEY
  })

  it('reports changed top-level keys from diagnostic hashes', async () => {
    const previewArgs = { id: 'post-1', message: 'first' }
    const executeArgs = { id: 'post-1', message: 'second' }
    const token = await signConfirmationToken({
      v: 1,
      operationId: 'delete-post',
      executePath: 'posts:delete',
      previewPath: 'posts:previewDelete',
      jti: 'token-1',
      principalKey: 'agent-1',
      tenantKey: 'tenant-1',
      argsHash: await hashConfirmationValue(previewArgs),
      argsFieldHashes: await hashArgsForDiagnostics(previewArgs),
      previewHash: await hashConfirmationValue({ id: 'post-1' }),
    })

    const result = await verifyDestructiveConfirmationToken(token, {
      operationId: 'delete-post',
      executePath: 'posts:delete',
      previewPath: 'posts:previewDelete',
      principalKey: 'agent-1',
      tenantKey: 'tenant-1',
      argsHash: await hashConfirmationValue(executeArgs),
      argsFieldHashes: await hashArgsForDiagnostics(executeArgs),
    })

    expect(result).toMatchObject({
      ok: false,
      failure: {
        category: 'conflict',
        code: 'CONFIRMATION_ARGS_MISMATCH',
        details: {
          changedKeys: ['message'],
          retryWithPreview: true,
        },
      },
    })
  })

  it('does not guess changed keys for old tokens without diagnostic hashes', async () => {
    const previewArgs = { id: 'post-1', message: 'first' }
    const executeArgs = { id: 'post-1', message: 'second' }
    const token = await signConfirmationToken({
      v: 1,
      operationId: 'delete-post',
      executePath: 'posts:delete',
      previewPath: 'posts:previewDelete',
      jti: 'token-1',
      principalKey: 'agent-1',
      tenantKey: 'tenant-1',
      argsHash: await hashConfirmationValue(previewArgs),
      previewHash: await hashConfirmationValue({ id: 'post-1' }),
    })

    const result = await verifyDestructiveConfirmationToken(token, {
      operationId: 'delete-post',
      executePath: 'posts:delete',
      previewPath: 'posts:previewDelete',
      principalKey: 'agent-1',
      tenantKey: 'tenant-1',
      argsHash: await hashConfirmationValue(executeArgs),
      argsFieldHashes: await hashArgsForDiagnostics(executeArgs),
    })

    expect(result).toMatchObject({
      ok: false,
      failure: {
        category: 'conflict',
        code: 'CONFIRMATION_ARGS_MISMATCH',
        details: {
          retryWithPreview: true,
        },
      },
    })
    if (!result.ok) {
      expect(result.failure.details).not.toHaveProperty('changedKeys')
    }
  })
})
