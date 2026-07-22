import { afterEach, describe, expect, it, vi } from 'vitest'

import { createExactCallNotesOperations } from '../../internal/labs/mcp-topology/nitro/exact-call/notes-client'
import type { NitroNotesVerifiedAccess } from '../../internal/labs/mcp-topology/nitro/notes-handler'

const access = Object.freeze<NitroNotesVerifiedAccess>({
  actor: { role: 'owner', subject: 'alice', tenantId: 'tenant-a' },
  authInfo: {
    clientId: 'client-a',
    extra: { issuer: 'https://authorization.example/', subject: 'alice' },
    resource: new URL('https://mcp.example/api/mcp'),
    scopes: ['notes:read', 'notes:write'],
    token: 'token-must-not-escape',
  },
})

afterEach(() => vi.unstubAllGlobals())

describe('vNext Nitro exact-call client', () => {
  it('cancels a chunked Convex response as soon as the response bound is crossed', async () => {
    const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
    let cancelled = false
    let pulls = 0
    const body = new ReadableStream<Uint8Array>(
      {
        cancel() {
          cancelled = true
        },
        pull(controller) {
          pulls += 1
          controller.enqueue(new Uint8Array(40 * 1024))
        },
      },
      { highWaterMark: 0 },
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200 })),
    )
    const operations = createExactCallNotesOperations({
      access,
      endpoint: new URL('https://convex.example/'),
      keyId: 'active',
      privateKey: Promise.resolve(keyPair.privateKey),
    })

    await expect(
      operations.searchNotes(access.actor, {
        query: '',
        workspaceId: 'workspace-a',
      }),
    ).rejects.toThrow('Exact call failed')
    expect(cancelled).toBe(true)
    expect(pulls).toBe(2)
  })
})
