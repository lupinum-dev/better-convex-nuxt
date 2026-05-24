import { describe, expect, it } from 'vitest'

import {
  createConfirmationToken,
  hashConfirmationToken,
  hashConfirmationValue,
} from '../../src/runtime/functions/confirmation-token'
import {
  createDestructivePreviewToken,
  createMemoryConfirmationStore,
  hashArgsForDiagnostics,
  verifyDestructiveConfirmationToken,
} from '../../src/runtime/mcp/destructive-confirmation'

describe('destructive confirmation diagnostics', () => {
  it('reports changed top-level keys from diagnostic hashes', async () => {
    const previewArgs = { id: 'post-1', message: 'first' }
    const executeArgs = { id: 'post-1', message: 'second' }
    const store = createMemoryConfirmationStore()
    const { token } = await createDestructivePreviewToken({
      binding: {
        operationId: 'delete-post',
        executePath: 'posts:delete',
        previewPath: 'posts:previewDelete',
        callerKey: 'agent-1',
        scopeKey: 'tenant-1',
        argsHash: await hashConfirmationValue(previewArgs),
        argsFieldHashes: await hashArgsForDiagnostics(previewArgs),
      },
      previewHash: await hashConfirmationValue({ id: 'post-1' }),
      versionHash: null,
      confirmationStore: store,
    })

    const result = await verifyDestructiveConfirmationToken(
      token,
      {
        operationId: 'delete-post',
        executePath: 'posts:delete',
        previewPath: 'posts:previewDelete',
        callerKey: 'agent-1',
        scopeKey: 'tenant-1',
        argsHash: await hashConfirmationValue(executeArgs),
        argsFieldHashes: await hashArgsForDiagnostics(executeArgs),
      },
      store,
    )

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
    const store = createMemoryConfirmationStore()
    const token = createConfirmationToken()
    const tokenHash = await hashConfirmationToken(token)
    await store.create({
      tokenHash,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      payload: {
        operationId: 'delete-post',
        executePath: 'posts:delete',
        previewPath: 'posts:previewDelete',
        callerKey: 'agent-1',
        scopeKey: 'tenant-1',
        argsHash: await hashConfirmationValue(previewArgs),
        jti: 'token-1',
        previewHash: await hashConfirmationValue({ id: 'post-1' }),
      },
    })

    const result = await verifyDestructiveConfirmationToken(
      token,
      {
        operationId: 'delete-post',
        executePath: 'posts:delete',
        previewPath: 'posts:previewDelete',
        callerKey: 'agent-1',
        scopeKey: 'tenant-1',
        argsHash: await hashConfirmationValue(executeArgs),
        argsFieldHashes: await hashArgsForDiagnostics(executeArgs),
      },
      store,
    )

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

  it('rejects opaque tokens that were never stored', async () => {
    const result = await verifyDestructiveConfirmationToken(
      'trellis-confirm-v1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      {
        operationId: 'delete-post',
        executePath: 'posts:delete',
        previewPath: 'posts:previewDelete',
        callerKey: 'agent-1',
        scopeKey: 'tenant-1',
        argsHash: await hashConfirmationValue({ id: 'post-1' }),
        argsFieldHashes: {},
      },
      createMemoryConfirmationStore(),
    )

    expect(result).toMatchObject({
      ok: false,
      failure: {
        category: 'confirmation_required',
        code: 'CONFIRMATION_TOKEN_INVALID',
      },
    })
  })
})
