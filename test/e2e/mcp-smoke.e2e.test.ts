import { fileURLToPath } from 'node:url'

import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureLocalConvex } from '../helpers/local-convex'

interface BootstrapResponse {
  organizationId: string
  resources: {
    noteId: string
    taskId: string
    postId: string
    commentId: string
  }
  keys: Record<
    'admin' | 'member' | 'viewer' | 'noOrg' | 'revoked',
    { id: string; key: string }
  >
}

interface McpStateResponse {
  keys: Array<{
    _id: string
    key: string
    status: string
    lastUsedAt?: number
  }>
  counts: Record<string, number>
}

let local: Awaited<ReturnType<typeof ensureLocalConvex>> | null = null
try {
  local = await ensureLocalConvex({
    cwd: fileURLToPath(new URL('../../playground', import.meta.url)),
  })
} catch (error) {
  console.warn('[e2e] Skipping MCP smoke suite: local Convex backend unavailable.', error)
}

const maybeDescribe = local ? describe : describe.skip

maybeDescribe('MCP route smoke', async () => {
  afterAll(async () => {
    if (local) {
      await local.release()
    }
  })

  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
    env: local?.env,
  })

  const fetchAny = $fetch as unknown as (
    request: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>
  const fetchRaw = $fetch.raw as unknown as (
    request: string,
    options?: Record<string, unknown>,
  ) => Promise<{ _data: unknown; headers: Headers }>

  let bootstrap: BootstrapResponse

  beforeAll(async () => {
    bootstrap = (await fetchAny('/api/test-mcp-bootstrap', {
      method: 'POST',
    })) as BootstrapResponse
  })

  async function rpc(
    body: Record<string, unknown>,
    options: { sessionId?: string; key?: string } = {},
  ) {
    return await fetchRaw('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(options.sessionId ? { 'Mcp-Session-Id': options.sessionId } : {}),
        ...(options.key ? { Authorization: `Bearer ${options.key}` } : {}),
      },
      body,
    })
  }

  async function initialize(key?: string) {
    const response = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'vitest', version: '1.0.0' },
      },
    }, { key })

    const payload = response._data as {
      result?: {
        meta?: { sessionId?: string }
      }
    }

    const sessionId
      = payload.result?.meta?.sessionId
        ?? response.headers.get('mcp-session-id')
        ?? response.headers.get('Mcp-Session-Id')

    expect(sessionId).toBeTruthy()
    return sessionId as string
  }

  async function readState() {
    return (await fetchAny('/api/test-mcp-state')) as McpStateResponse
  }

  it('lists only public tools anonymously', async () => {
    const sessionId = await initialize()
    const response = await rpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    }, { sessionId })

    const payload = response._data as {
      result?: {
        tools?: Array<{ name: string }>
      }
    }

    const toolNames = payload.result?.tools?.map(tool => tool.name) ?? []

    expect(toolNames).toContain('list-notes')
    expect(toolNames).toContain('create-note')
    expect(toolNames).toContain('search-notes')
    expect(toolNames).not.toContain('add-task')
    expect(toolNames).not.toContain('list-posts')
  })

  it('exposes authenticated tools and round-trips public tool calls', async () => {
    const memberSession = await initialize(bootstrap.keys.member.key)

    const listResponse = await rpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
    }, { sessionId: memberSession, key: bootstrap.keys.member.key })

    const toolNames = ((listResponse._data as {
      result?: { tools?: Array<{ name: string }> }
    }).result?.tools ?? []).map(tool => tool.name)

    expect(toolNames).toContain('add-task')
    expect(toolNames).toContain('list-posts')
    expect(toolNames).toContain('create-post')

    const createNote = await rpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'create-note',
        arguments: {
          title: 'E2E public note',
          content: 'Created through /mcp',
        },
      },
    }, { sessionId: memberSession, key: bootstrap.keys.member.key })

    const notePayload = createNote._data as {
      result?: {
        structuredContent?: {
          ok?: boolean
          data?: { id?: string }
        }
      }
    }

    expect(notePayload.result?.structuredContent?.ok).toBe(true)
    expect(notePayload.result?.structuredContent?.data?.id).toBeTruthy()
  })

  it('handles auth-required and org-scoped failures correctly', async () => {
    const publicSession = await initialize()
    const noOrgSession = await initialize(bootstrap.keys.noOrg.key)
    const viewerSession = await initialize(bootstrap.keys.viewer.key)

    const anonTask = await rpc({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'add-task',
        arguments: { title: 'Should fail' },
      },
    }, { sessionId: publicSession })

    const anonPayload = anonTask._data as {
      result?: {
        structuredContent?: {
          ok?: boolean
          error?: { category?: string }
        }
      }
    }

    expect(anonPayload.result?.structuredContent?.ok).toBe(false)
    expect(anonPayload.result?.structuredContent?.error?.category).toBe('auth')

    const noOrgPostList = await rpc({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'list-posts',
        arguments: {},
      },
    }, { sessionId: noOrgSession, key: bootstrap.keys.noOrg.key })

    const noOrgPayload = noOrgPostList._data as {
      result?: {
        structuredContent?: {
          ok?: boolean
          error?: { category?: string }
        }
      }
    }

    expect(noOrgPayload.result?.structuredContent?.ok).toBe(false)
    expect(noOrgPayload.result?.structuredContent?.error?.category).toBe('auth')

    const viewerCreatePost = await rpc({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'create-post',
        arguments: {
          title: 'Viewer cannot create',
          content: 'Denied',
        },
      },
    }, { sessionId: viewerSession, key: bootstrap.keys.viewer.key })

    const viewerPayload = viewerCreatePost._data as {
      result?: {
        structuredContent?: {
          ok?: boolean
          error?: { category?: string }
        }
      }
    }

    expect(viewerPayload.result?.structuredContent?.ok).toBe(false)
    expect(viewerPayload.result?.structuredContent?.error?.category).toBe('auth')
  })

  it('enforces destructive confirmation, rejects revoked keys, and touches lastUsedAt', async () => {
    const memberSession = await initialize(bootstrap.keys.member.key)
    const revokedSession = await initialize(bootstrap.keys.revoked.key)

    const preview = await rpc({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'delete-post',
        arguments: {
          id: bootstrap.resources.postId,
        },
      },
    }, { sessionId: memberSession, key: bootstrap.keys.member.key })

    const previewPayload = preview._data as {
      result?: {
        structuredContent?: {
          ok?: boolean
          awaitingConfirmation?: boolean
        }
      }
    }

    expect(previewPayload.result?.structuredContent?.ok).toBe(true)
    expect(previewPayload.result?.structuredContent?.awaitingConfirmation).toBe(true)

    const confirmed = await rpc({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'delete-post',
        arguments: {
          id: bootstrap.resources.postId,
          _confirmed: true,
        },
      },
    }, { sessionId: memberSession, key: bootstrap.keys.member.key })

    const confirmedPayload = confirmed._data as {
      result?: {
        structuredContent?: {
          ok?: boolean
          data?: { deleted?: boolean }
        }
      }
    }

    expect(confirmedPayload.result?.structuredContent?.ok).toBe(true)
    expect(confirmedPayload.result?.structuredContent?.data?.deleted).toBe(true)

    const revokedCall = await rpc({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'list-posts',
        arguments: {},
      },
    }, { sessionId: revokedSession, key: bootstrap.keys.revoked.key })

    const revokedPayload = revokedCall._data as {
      result?: {
        structuredContent?: {
          ok?: boolean
          error?: { category?: string }
        }
      }
    }

    expect(revokedPayload.result?.structuredContent?.ok).toBe(false)
    expect(revokedPayload.result?.structuredContent?.error?.category).toBe('auth')

    let touchedKey: { lastUsedAt?: number } | undefined
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const state = await readState()
      touchedKey = state.keys.find(key => key._id === bootstrap.keys.member.id)
      if (touchedKey?.lastUsedAt) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    expect(touchedKey?.lastUsedAt).toEqual(expect.any(Number))
  })
})
