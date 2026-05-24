import { fileURLToPath } from 'node:url'

import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { harnessE2ePort } from '../support/e2e/harness-port'
import { ensureManagedLocalConvex } from '../support/e2e/managed-convex'
import {
  fetchMcpBootstrap,
  fetchMcpState,
  type BootstrapResponse,
} from '../support/e2e/mcp-bootstrap'
import { initializeMcpSession, rpc } from '../support/e2e/mcp-client'

const local = await ensureManagedLocalConvex({
  cwd: fileURLToPath(new URL('../../apps/harness', import.meta.url)),
})

describe('MCP route smoke', async () => {
  afterAll(async () => {
    await local.release()
  })

  await setup({
    rootDir: fileURLToPath(new URL('../../apps/harness', import.meta.url)),
    env: local.env,
    port: harnessE2ePort,
  })

  const fetchAny = $fetch as unknown as (
    request: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>
  let bootstrap: BootstrapResponse

  beforeAll(async () => {
    bootstrap = await fetchMcpBootstrap(fetchAny)
  })

  it('lists only public tools anonymously', async () => {
    const sessionId = await initializeMcpSession()
    expect(sessionId).toEqual(expect.any(String))

    const response = await rpc(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      },
      { sessionId },
    )

    const payload = response._data as {
      result?: {
        tools?: Array<{ name: string }>
      }
    }

    const toolNames = payload.result?.tools?.map((tool) => tool.name) ?? []

    expect(toolNames).toContain('list-notes')
    expect(toolNames).toContain('create-note')
    expect(toolNames).toContain('search-notes')
    expect(toolNames).toContain('get-session-preference')
    expect(toolNames).not.toContain('add-task')
    expect(toolNames).not.toContain('list-posts')
    expect(toolNames).not.toContain('set-session-preference')
    expect(toolNames).not.toContain('register-session-shortcut')
    expect(toolNames).not.toContain('unregister-session-shortcut')

    const blockedSessionWrite = await rpc(
      {
        jsonrpc: '2.0',
        id: 22,
        method: 'tools/call',
        params: {
          name: 'set-session-preference',
          arguments: {
            preferredSearch: 'anonymous write',
          },
        },
      },
      { sessionId },
    )
    const blockedPayload = blockedSessionWrite._data as {
      error?: { message?: string }
      result?: {
        content?: Array<{ text?: string }>
        isError?: boolean
      }
    }

    expect(blockedPayload.result?.isError ?? false).toBe(true)
    expect(
      blockedPayload.error?.message ?? blockedPayload.result?.content?.[0]?.text ?? '',
    ).toMatch(/auth|disabled|not found/i)

    const publicSessionRead = await rpc(
      {
        jsonrpc: '2.0',
        id: 23,
        method: 'tools/call',
        params: {
          name: 'get-session-preference',
          arguments: {},
        },
      },
      { sessionId },
    )
    const publicReadPayload = publicSessionRead._data as {
      result?: { structuredContent?: { preferredSearch?: string } }
    }

    expect(publicReadPayload.result?.structuredContent?.preferredSearch ?? null).toBeNull()
  })

  it('rejects bad bearer credentials instead of falling back to anonymous tools', async () => {
    const response = await rpc(
      {
        jsonrpc: '2.0',
        id: 21,
        method: 'tools/list',
      },
      { key: 'mcp_invalid_test_key_0000000000000000' },
    )

    expect(response.status).toBe(401)
  })

  it('exposes authenticated tools and round-trips public tool calls', async () => {
    const memberSession = await initializeMcpSession(bootstrap.keys.member.key)
    expect(memberSession).toEqual(expect.any(String))

    const listResponse = await rpc(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
      },
      { sessionId: memberSession, key: bootstrap.keys.member.key },
    )

    const toolNames = (
      (
        listResponse._data as {
          result?: { tools?: Array<{ name: string }> }
        }
      ).result?.tools ?? []
    ).map((tool) => tool.name)

    expect(toolNames).toContain('add-task')
    expect(toolNames).toContain('list-posts')
    expect(toolNames).toContain('create-post')

    const createNote = await rpc(
      {
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
      },
      { sessionId: memberSession, key: bootstrap.keys.member.key },
    )

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
    const noOrgSession = await initializeMcpSession(bootstrap.keys.noOrg.key)
    const viewerSession = await initializeMcpSession(bootstrap.keys.viewer.key)

    const noOrgList = await rpc(
      {
        jsonrpc: '2.0',
        id: 30,
        method: 'tools/list',
      },
      { sessionId: noOrgSession, key: bootstrap.keys.noOrg.key },
    )

    const noOrgToolNames = (
      (
        noOrgList._data as {
          result?: { tools?: Array<{ name: string }> }
        }
      ).result?.tools ?? []
    ).map((tool) => tool.name)

    expect(noOrgToolNames).not.toContain('list-posts')
    expect(noOrgToolNames).not.toContain('create-post')
    expect(noOrgToolNames).not.toContain('create-comment')

    const viewerList = await rpc(
      {
        jsonrpc: '2.0',
        id: 31,
        method: 'tools/list',
      },
      { sessionId: viewerSession, key: bootstrap.keys.viewer.key },
    )

    const viewerToolNames = (
      (
        viewerList._data as {
          result?: { tools?: Array<{ name: string }> }
        }
      ).result?.tools ?? []
    ).map((tool) => tool.name)

    expect(viewerToolNames).toContain('list-posts')
    expect(viewerToolNames).toContain('create-comment')
    expect(viewerToolNames).not.toContain('create-post')
  })

  it('handles auth-required and org-scoped failures correctly', async () => {
    const publicSession = await initializeMcpSession()
    const noOrgSession = await initializeMcpSession(bootstrap.keys.noOrg.key)
    const viewerSession = await initializeMcpSession(bootstrap.keys.viewer.key)

    const anonTask = await rpc(
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'add-task',
          arguments: { title: 'Should fail' },
        },
      },
      { sessionId: publicSession },
    )

    const anonPayload = anonTask._data as {
      result?: {
        isError?: boolean
        content?: Array<{ text?: string }>
      }
    }

    expect(anonPayload.result?.isError).toBe(true)
    expect(anonPayload.result?.content?.[0]?.text).toContain('Tool add-task not found')

    const noOrgPostList = await rpc(
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'list-posts',
          arguments: {},
        },
      },
      { sessionId: noOrgSession, key: bootstrap.keys.noOrg.key },
    )

    const noOrgPayload = noOrgPostList._data as {
      result?: {
        isError?: boolean
        content?: Array<{ text?: string }>
      }
    }

    expect(noOrgPayload.result?.isError).toBe(true)
    expect(noOrgPayload.result?.content?.[0]?.text).toContain('Tool list-posts not found')

    const viewerCreatePost = await rpc(
      {
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
      },
      { sessionId: viewerSession, key: bootstrap.keys.viewer.key },
    )

    const viewerPayload = viewerCreatePost._data as {
      result?: {
        isError?: boolean
        content?: Array<{ text?: string }>
      }
    }

    expect(viewerPayload.result?.isError).toBe(true)
    expect(viewerPayload.result?.content?.[0]?.text).toContain('Tool create-post not found')
  })

  it('enforces destructive confirmation, rejects revoked keys, and touches lastUsedAt', async () => {
    const adminSession = await initializeMcpSession(bootstrap.keys.admin.key)
    const revokedSession = await initializeMcpSession(bootstrap.keys.revoked.key)

    const preview = await rpc(
      {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'delete-post',
          arguments: {
            id: bootstrap.resources.postId,
          },
        },
      },
      { sessionId: adminSession, key: bootstrap.keys.admin.key },
    )

    const previewPayload = preview._data as {
      result?: {
        structuredContent?: {
          ok?: boolean
          awaitingConfirmation?: boolean
          preview?: {
            confirmation?: { token?: string }
          }
        }
      }
    }

    expect(previewPayload.result?.structuredContent?.ok).toBe(true)
    expect(previewPayload.result?.structuredContent?.awaitingConfirmation).toBe(true)
    expect(previewPayload.result?.structuredContent?.preview?.confirmation?.token).toEqual(
      expect.any(String),
    )

    const confirmed = await rpc(
      {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: 'delete-post',
          arguments: {
            id: bootstrap.resources.postId,
            _confirmationToken:
              previewPayload.result?.structuredContent?.preview?.confirmation?.token,
          },
        },
      },
      { sessionId: adminSession, key: bootstrap.keys.admin.key },
    )

    const confirmedPayload = confirmed._data as {
      result?: {
        structuredContent?: {
          ok?: boolean
          data?: { deleted?: boolean }
        }
      }
    }

    if (confirmedPayload.result?.structuredContent?.ok !== true) {
      throw new Error(`delete-post confirmed payload ${JSON.stringify(confirmed._data)}`)
    }
    expect(confirmedPayload.result?.structuredContent?.ok).toBe(true)
    expect(confirmedPayload.result?.structuredContent?.data?.deleted).toBe(true)

    const firstState = await fetchMcpState(fetchAny)
    expect(firstState.confirmations).toHaveLength(1)
    expect(firstState.audit).toHaveLength(1)
    expect(firstState.confirmations[0]).toMatchObject({
      operationId: 'posts.remove',
      callerKey: `agent:${bootstrap.users.admin.id}:admin`,
      scopeKey: bootstrap.organizationId,
    })
    expect(firstState.audit[0]).toMatchObject({
      operationId: 'posts.remove',
      jti: firstState.confirmations[0]?.jti,
      callerKey: `agent:${bootstrap.users.admin.id}:admin`,
      scopeKey: bootstrap.organizationId,
      executePath: 'posts:removeWithConfirmation',
    })

    const replay = await rpc(
      {
        jsonrpc: '2.0',
        id: 91,
        method: 'tools/call',
        params: {
          name: 'delete-post',
          arguments: {
            id: bootstrap.resources.postId,
            _confirmationToken:
              previewPayload.result?.structuredContent?.preview?.confirmation?.token,
          },
        },
      },
      { sessionId: adminSession, key: bootstrap.keys.admin.key },
    )

    const replayPayload = replay._data as {
      result?: {
        isError?: boolean
        content?: Array<{ text?: string }>
      }
    }

    expect(replayPayload.result?.isError).toBe(true)
    expect(replayPayload.result?.content?.[0]?.text).toMatch(
      /already been redeemed|Post not found/i,
    )

    const createDriftPost = await rpc(
      {
        jsonrpc: '2.0',
        id: 92,
        method: 'tools/call',
        params: {
          name: 'create-post',
          arguments: {
            title: 'Drift target',
            content: 'State will change after preview',
          },
        },
      },
      { sessionId: adminSession, key: bootstrap.keys.admin.key },
    )

    const createdDriftPost = createDriftPost._data as {
      result?: { structuredContent?: { data?: { id?: string } } }
    }
    const driftPostId = createdDriftPost.result?.structuredContent?.data?.id
    expect(driftPostId).toEqual(expect.any(String))

    const driftPreviewA = await rpc(
      {
        jsonrpc: '2.0',
        id: 93,
        method: 'tools/call',
        params: {
          name: 'delete-post',
          arguments: {
            id: driftPostId,
          },
        },
      },
      { sessionId: adminSession, key: bootstrap.keys.admin.key },
    )

    const driftPreviewB = await rpc(
      {
        jsonrpc: '2.0',
        id: 94,
        method: 'tools/call',
        params: {
          name: 'delete-post',
          arguments: {
            id: driftPostId,
          },
        },
      },
      { sessionId: adminSession, key: bootstrap.keys.admin.key },
    )

    const driftTokenA = (
      driftPreviewA._data as {
        result?: { structuredContent?: { preview?: { confirmation?: { token?: string } } } }
      }
    ).result?.structuredContent?.preview?.confirmation?.token
    const driftTokenB = (
      driftPreviewB._data as {
        result?: { structuredContent?: { preview?: { confirmation?: { token?: string } } } }
      }
    ).result?.structuredContent?.preview?.confirmation?.token

    expect(driftTokenA).toEqual(expect.any(String))
    expect(driftTokenB).toEqual(expect.any(String))

    const driftDelete = await rpc(
      {
        jsonrpc: '2.0',
        id: 95,
        method: 'tools/call',
        params: {
          name: 'delete-post',
          arguments: {
            id: driftPostId,
            _confirmationToken: driftTokenB,
          },
        },
      },
      { sessionId: adminSession, key: bootstrap.keys.admin.key },
    )

    const driftDeletePayload = driftDelete._data as {
      result?: { structuredContent?: { ok?: boolean } }
    }
    expect(driftDeletePayload.result?.structuredContent?.ok).toBe(true)

    const driftReplay = await rpc(
      {
        jsonrpc: '2.0',
        id: 96,
        method: 'tools/call',
        params: {
          name: 'delete-post',
          arguments: {
            id: driftPostId,
            _confirmationToken: driftTokenA,
          },
        },
      },
      { sessionId: adminSession, key: bootstrap.keys.admin.key },
    )

    const driftReplayPayload = driftReplay._data as {
      result?: {
        isError?: boolean
        content?: Array<{ text?: string }>
      }
    }

    expect(driftReplayPayload.result?.isError).toBe(true)

    const secondState = await fetchMcpState(fetchAny)
    expect(secondState.confirmations).toHaveLength(3)
    expect(secondState.audit).toHaveLength(2)

    const revokedCall = await rpc(
      {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'list-posts',
          arguments: {},
        },
      },
      { sessionId: revokedSession, key: bootstrap.keys.revoked.key },
    )

    expect(revokedCall.status).toBe(401)

    let touchedKey: { lastUsedAt?: number } | undefined
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const state = await fetchMcpState(fetchAny)
      touchedKey = state.keys.find((key) => key._id === bootstrap.keys.admin.id)
      if (touchedKey?.lastUsedAt) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    expect(touchedKey?.lastUsedAt).toEqual(expect.any(Number))
  })

  it('persists session state and supports dynamic session-local tools', async () => {
    const memberSession = await initializeMcpSession(bootstrap.keys.member.key)
    const shortcutName = 'release-check'
    const registeredName = `session-shortcut-${shortcutName}`

    const setPreference = await rpc(
      {
        jsonrpc: '2.0',
        id: 40,
        method: 'tools/call',
        params: {
          name: 'set-session-preference',
          arguments: {
            preferredSearch: 'release board',
          },
        },
      },
      { sessionId: memberSession, key: bootstrap.keys.member.key },
    )

    expect(
      (
        setPreference._data as {
          result?: { structuredContent?: { preferredSearch?: string } }
        }
      ).result?.structuredContent?.preferredSearch,
    ).toBe('release board')

    const getPreference = await rpc(
      {
        jsonrpc: '2.0',
        id: 41,
        method: 'tools/call',
        params: {
          name: 'get-session-preference',
          arguments: {},
        },
      },
      { sessionId: memberSession, key: bootstrap.keys.member.key },
    )

    expect(
      (
        getPreference._data as {
          result?: { structuredContent?: { preferredSearch?: string } }
        }
      ).result?.structuredContent?.preferredSearch,
    ).toBe('release board')

    await rpc(
      {
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
      },
      { sessionId: memberSession, key: bootstrap.keys.member.key },
    )

    const afterRegister = await rpc(
      {
        jsonrpc: '2.0',
        id: 43,
        method: 'tools/list',
      },
      { sessionId: memberSession, key: bootstrap.keys.member.key },
    )

    const registeredTools = (
      (
        afterRegister._data as {
          result?: { tools?: Array<{ name: string }> }
        }
      ).result?.tools ?? []
    ).map((tool) => tool.name)

    expect(registeredTools).toContain(registeredName)

    const shortcutCall = await rpc(
      {
        jsonrpc: '2.0',
        id: 44,
        method: 'tools/call',
        params: {
          name: registeredName,
          arguments: {},
        },
      },
      { sessionId: memberSession, key: bootstrap.keys.member.key },
    )

    expect(
      (
        shortcutCall._data as {
          result?: { structuredContent?: { ok?: boolean; message?: string } }
        }
      ).result?.structuredContent,
    ).toMatchObject({
      ok: true,
      message: 'Ship it.',
    })

    await rpc(
      {
        jsonrpc: '2.0',
        id: 45,
        method: 'tools/call',
        params: {
          name: 'unregister-session-shortcut',
          arguments: {
            name: shortcutName,
          },
        },
      },
      { sessionId: memberSession, key: bootstrap.keys.member.key },
    )

    const afterUnregister = await rpc(
      {
        jsonrpc: '2.0',
        id: 46,
        method: 'tools/list',
      },
      { sessionId: memberSession, key: bootstrap.keys.member.key },
    )

    const finalTools = (
      (
        afterUnregister._data as {
          result?: { tools?: Array<{ name: string }> }
        }
      ).result?.tools ?? []
    ).map((tool) => tool.name)

    expect(finalTools).not.toContain(registeredName)
  })
})
