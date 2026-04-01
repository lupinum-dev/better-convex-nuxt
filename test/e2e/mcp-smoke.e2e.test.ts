import { fileURLToPath } from 'node:url'

import { $fetch, fetch as testFetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PLAYGROUND_LOCAL_SERVICE_KEY } from '../../playground/shared/dev-service-key'
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
    env: {
      ...local?.env,
      CONVEX_SERVICE_KEY: PLAYGROUND_LOCAL_SERVICE_KEY,
    },
  })

  const fetchAny = $fetch as unknown as (
    request: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>
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
    const response = await testFetch('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(options.sessionId ? { 'Mcp-Session-Id': options.sessionId } : {}),
        ...(options.key ? { Authorization: `Bearer ${options.key}` } : {}),
      },
      body: JSON.stringify(body),
    })

    const text = await response.text()
    const contentType = response.headers.get('content-type') ?? ''
    const data = contentType.includes('text/event-stream')
      ? parseSsePayload(text)
      : JSON.parse(text) as unknown

    return {
      _data: data,
      headers: response.headers,
      status: response.status,
    }
  }

  async function initialize(key?: string): Promise<string | undefined> {
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
        protocolVersion?: string
      }
    }

    expect(payload.result?.protocolVersion).toBe('2025-03-26')
    return response.headers.get('mcp-session-id') ?? response.headers.get('Mcp-Session-Id') ?? undefined
  }

  async function readState() {
    return (await fetchAny('/api/test-mcp-state')) as McpStateResponse
  }

  it('lists only public tools anonymously', async () => {
    const sessionId = await initialize()
    expect(sessionId).toEqual(expect.any(String))

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
    expect(memberSession).toEqual(expect.any(String))

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

  it('hides scoped and role-denied tools from discovery', async () => {
    const noOrgSession = await initialize(bootstrap.keys.noOrg.key)
    const viewerSession = await initialize(bootstrap.keys.viewer.key)

    const noOrgList = await rpc({
      jsonrpc: '2.0',
      id: 30,
      method: 'tools/list',
    }, { sessionId: noOrgSession, key: bootstrap.keys.noOrg.key })

    const noOrgToolNames = ((noOrgList._data as {
      result?: { tools?: Array<{ name: string }> }
    }).result?.tools ?? []).map(tool => tool.name)

    expect(noOrgToolNames).not.toContain('list-posts')
    expect(noOrgToolNames).not.toContain('create-post')
    expect(noOrgToolNames).not.toContain('create-comment')

    const viewerList = await rpc({
      jsonrpc: '2.0',
      id: 31,
      method: 'tools/list',
    }, { sessionId: viewerSession, key: bootstrap.keys.viewer.key })

    const viewerToolNames = ((viewerList._data as {
      result?: { tools?: Array<{ name: string }> }
    }).result?.tools ?? []).map(tool => tool.name)

    expect(viewerToolNames).toContain('list-posts')
    expect(viewerToolNames).toContain('create-comment')
    expect(viewerToolNames).not.toContain('create-post')
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
        isError?: boolean
        content?: Array<{ text?: string }>
      }
    }

    expect(anonPayload.result?.isError).toBe(true)
    expect(anonPayload.result?.content?.[0]?.text).toContain('Tool add-task not found')

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
        isError?: boolean
        structuredContent?: {
          ok?: boolean
          error?: { category?: string }
        }
        content?: Array<{ text?: string }>
      }
    }

    expect(
      noOrgPayload.result?.structuredContent?.ok === false
      || noOrgPayload.result?.isError === true,
    ).toBe(true)
    expect(
      noOrgPayload.result?.structuredContent?.error?.category === 'auth'
      || noOrgPayload.result?.content?.[0]?.text?.includes('Tool list-posts not found') === true,
    ).toBe(true)

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
        isError?: boolean
        structuredContent?: {
          ok?: boolean
          error?: { category?: string }
        }
        content?: Array<{ text?: string }>
      }
    }

    expect(
      viewerPayload.result?.structuredContent?.ok === false
      || viewerPayload.result?.isError === true,
    ).toBe(true)
    expect(
      viewerPayload.result?.structuredContent?.error?.category === 'auth'
      || viewerPayload.result?.content?.[0]?.text?.includes('Tool create-post not found') === true,
    ).toBe(true)
  })

  it('enforces destructive confirmation, rejects revoked keys, and touches lastUsedAt', async () => {
    const adminSession = await initialize(bootstrap.keys.admin.key)
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
    }, { sessionId: adminSession, key: bootstrap.keys.admin.key })

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
    }, { sessionId: adminSession, key: bootstrap.keys.admin.key })

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
        isError?: boolean
        structuredContent?: {
          ok?: boolean
          error?: { category?: string }
        }
        content?: Array<{ text?: string }>
      }
    }

    expect(
      revokedPayload.result?.structuredContent?.ok === false
      || revokedPayload.result?.isError === true,
    ).toBe(true)
    expect(
      revokedPayload.result?.structuredContent?.error?.category === 'auth'
      || revokedPayload.result?.content?.[0]?.text?.includes('Tool list-posts not found') === true,
    ).toBe(true)

    let touchedKey: { lastUsedAt?: number } | undefined
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const state = await readState()
      touchedKey = state.keys.find(key => key._id === bootstrap.keys.admin.id)
      if (touchedKey?.lastUsedAt) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    expect(touchedKey?.lastUsedAt).toEqual(expect.any(Number))
  })

  it('persists session state and supports dynamic session-local tools', async () => {
    const memberSession = await initialize(bootstrap.keys.member.key)
    const shortcutName = 'release-check'
    const registeredName = `session-shortcut-${shortcutName}`

    const setPreference = await rpc({
      jsonrpc: '2.0',
      id: 40,
      method: 'tools/call',
      params: {
        name: 'set-session-preference',
        arguments: {
          preferredSearch: 'release board',
        },
      },
    }, { sessionId: memberSession, key: bootstrap.keys.member.key })

    expect((setPreference._data as {
      result?: { structuredContent?: { preferredSearch?: string } }
    }).result?.structuredContent?.preferredSearch).toBe('release board')

    const getPreference = await rpc({
      jsonrpc: '2.0',
      id: 41,
      method: 'tools/call',
      params: {
        name: 'get-session-preference',
        arguments: {},
      },
    }, { sessionId: memberSession, key: bootstrap.keys.member.key })

    expect((getPreference._data as {
      result?: { structuredContent?: { preferredSearch?: string } }
    }).result?.structuredContent?.preferredSearch).toBe('release board')

    await rpc({
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/call',
      params: {
        name: 'register-session-shortcut',
        arguments: {
          name: shortcutName,
          message: 'Ship it.',
        },
      },
    }, { sessionId: memberSession, key: bootstrap.keys.member.key })

    const afterRegister = await rpc({
      jsonrpc: '2.0',
      id: 43,
      method: 'tools/list',
    }, { sessionId: memberSession, key: bootstrap.keys.member.key })

    const registeredTools = ((afterRegister._data as {
      result?: { tools?: Array<{ name: string }> }
    }).result?.tools ?? []).map(tool => tool.name)

    expect(registeredTools).toContain(registeredName)

    const shortcutCall = await rpc({
      jsonrpc: '2.0',
      id: 44,
      method: 'tools/call',
      params: {
        name: registeredName,
        arguments: {},
      },
    }, { sessionId: memberSession, key: bootstrap.keys.member.key })

    expect((shortcutCall._data as {
      result?: { structuredContent?: { ok?: boolean; message?: string } }
    }).result?.structuredContent).toMatchObject({
      ok: true,
      message: 'Ship it.',
    })

    await rpc({
      jsonrpc: '2.0',
      id: 45,
      method: 'tools/call',
      params: {
        name: 'unregister-session-shortcut',
        arguments: {
          name: shortcutName,
        },
      },
    }, { sessionId: memberSession, key: bootstrap.keys.member.key })

    const afterUnregister = await rpc({
      jsonrpc: '2.0',
      id: 46,
      method: 'tools/list',
    }, { sessionId: memberSession, key: bootstrap.keys.member.key })

    const finalTools = ((afterUnregister._data as {
      result?: { tools?: Array<{ name: string }> }
    }).result?.tools ?? []).map(tool => tool.name)

    expect(finalTools).not.toContain(registeredName)
  })
})

function parseSsePayload(text: string) {
  const match = text.match(/data:\s*(\{[\s\S]*\})/)
  if (!match?.[1]) {
    throw new Error(`Could not parse SSE payload: ${text}`)
  }

  return JSON.parse(match[1]) as unknown
}
