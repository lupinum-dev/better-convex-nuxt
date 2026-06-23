import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  resetServerConvexQueryMock,
  serverConvexQueryCalls,
  setServerConvexQueryResult,
} from './mocks/convexServer'

type FakeEvent = {
  body?: unknown
  headers?: Record<string, string>
  params?: Record<string, string | undefined>
  responseHeaders?: Record<string, string[]>
  url?: string
}

type FetchCall = {
  body?: unknown
  headers: Record<string, string>
  method?: string
  url: string
}

const fetchCalls: FetchCall[] = []
let fetchResponseData: unknown = { ok: true }

vi.mock('h3', () => {
  return {
    appendResponseHeader: (event: FakeEvent, name: string, value: string) => {
      event.responseHeaders ??= {}
      event.responseHeaders[name] ??= []
      event.responseHeaders[name].push(value)
    },
    createError: (args: { statusCode: number; statusMessage: string }) => {
      const error = new Error(args.statusMessage) as Error & {
        statusCode: number
        statusMessage: string
      }
      error.statusCode = args.statusCode
      error.statusMessage = args.statusMessage
      return error
    },
    defineEventHandler: (handler: unknown) => handler,
    getRequestHeader: (event: FakeEvent, name: string) => event.headers?.[name.toLowerCase()],
    getRequestURL: (event: FakeEvent) => new URL(event.url ?? 'http://app.test/current'),
    getRouterParam: (event: FakeEvent, name: string) => event.params?.[name],
    readBody: async (event: FakeEvent) => event.body,
  }
})

function event(args: FakeEvent = {}) {
  return {
    headers: {
      cookie: 'better-auth.session_token=session',
      origin: 'http://app.test',
      referer: 'http://app.test/source',
      ...args.headers,
    },
    params: args.params ?? {},
    responseHeaders: {},
    url: args.url ?? 'http://app.test/current',
    body: args.body,
  } satisfies FakeEvent
}

function latestFetchBody() {
  return fetchCalls.at(-1)?.body
}

function firstFetchCall() {
  return fetchCalls.at(0)
}

async function loadHandler<T extends (event: FakeEvent) => Promise<unknown>>(path: string) {
  const mod = (await import(path)) as { default: T }
  return mod.default
}

beforeEach(() => {
  fetchCalls.length = 0
  fetchResponseData = { ok: true }
  resetServerConvexQueryMock()
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    fetchCalls.push({
      url: String(url),
      method: init?.method,
      headers: Object.fromEntries(headers.entries()),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })

    return new Response(JSON.stringify({ data: fetchResponseData }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
})

describe('management route contracts', () => {
  it('forwards organization rename without trusting client-supplied audit fields', async () => {
    fetchResponseData = { id: 'org_1', name: 'Acme Labs' }
    const handler = await loadHandler<
      typeof import('../server/api/organizations/[organizationId]/rename.post').default
    >('../server/api/organizations/[organizationId]/rename.post')

    const result = await handler(
      event({
        params: { organizationId: 'org_1' },
        body: {
          name: '  Acme Labs  ',
          previousName: 'Forged old name',
          summary: 'Forged summary',
        },
      }),
    )

    expect(result).toEqual(fetchResponseData)
    expect(fetchCalls).toHaveLength(1)
    expect(firstFetchCall()?.url).toBe('http://app.test/api/auth/organization/update')
    expect(latestFetchBody()).toEqual({
      organizationId: 'org_1',
      data: { name: 'Acme Labs' },
    })
  })

  it('rejects owner invitations at the Nuxt boundary', async () => {
    const handler = await loadHandler<
      typeof import('../server/api/organizations/[organizationId]/members/invite.post').default
    >('../server/api/organizations/[organizationId]/members/invite.post')

    await expect(
      handler(
        event({
          params: { organizationId: 'org_1' },
          body: {
            email: 'owner@example.com',
            role: 'owner',
            teamId: 'team_1',
          },
        }),
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Valid role is required',
    })
    expect(fetchCalls).toHaveLength(0)
  })

  it('adds team members only after resolving management authority in Convex', async () => {
    fetchResponseData = { id: 'team_member_1', teamId: 'team_1', userId: 'user_1' }
    setServerConvexQueryResult({ organizationId: 'org_from_convex', teamId: 'team_1' })
    const handler = await loadHandler<
      typeof import('../server/api/teams/[teamId]/members/add.post').default
    >('../server/api/teams/[teamId]/members/add.post')

    const result = await handler(
      event({
        params: { teamId: 'team_1' },
        body: {
          userId: '  user_1  ',
          label: 'Forged user label',
        },
      }),
    )

    expect(result).toEqual(fetchResponseData)
    expect(serverConvexQueryCalls).toEqual([
      {
        functionReference: 'teamAccess.resolveForManagement',
        args: { teamId: 'team_1', permission: 'update' },
        options: { auth: 'required' },
      },
    ])
    expect(latestFetchBody()).toEqual({
      organizationId: 'org_from_convex',
      teamId: 'team_1',
      userId: 'user_1',
    })
  })

  it('removes team members only after resolving delete authority in Convex', async () => {
    setServerConvexQueryResult({ organizationId: 'org_from_convex', teamId: 'team_1' })
    const handler = await loadHandler<
      typeof import('../server/api/teams/[teamId]/members/remove.post').default
    >('../server/api/teams/[teamId]/members/remove.post')

    const result = await handler(
      event({
        params: { teamId: 'team_1' },
        body: {
          userId: '  user_1  ',
          label: 'Forged user label',
        },
      }),
    )

    expect(result).toEqual({ ok: true })
    expect(serverConvexQueryCalls).toEqual([
      {
        functionReference: 'teamAccess.resolveForManagement',
        args: { teamId: 'team_1', permission: 'delete' },
        options: { auth: 'required' },
      },
    ])
    expect(latestFetchBody()).toEqual({
      organizationId: 'org_from_convex',
      teamId: 'team_1',
      userId: 'user_1',
    })
  })

  it('removes organization members using the URL member id as the only target', async () => {
    const handler = await loadHandler<
      typeof import('../server/api/organizations/[organizationId]/members/[memberId]/remove.post').default
    >('../server/api/organizations/[organizationId]/members/[memberId]/remove.post')

    const result = await handler(
      event({
        params: { organizationId: 'org_1', memberId: 'member_from_url' },
        body: {
          memberIdOrEmail: 'forged-target@example.com',
        },
      }),
    )

    expect(result).toEqual({ ok: true })
    expect(latestFetchBody()).toEqual({
      organizationId: 'org_1',
      memberIdOrEmail: 'member_from_url',
    })
  })

  it('filters list-user-teams responses to the requested organization', async () => {
    fetchResponseData = [
      { id: 'team_1', organizationId: 'org_1', name: 'Product' },
      { id: 'team_2', organizationId: 'org_2', name: 'Other org' },
    ]
    setServerConvexQueryResult({ canManageTeams: false })
    const handler = await loadHandler<
      typeof import('../server/api/organizations/[organizationId]/teams.get').default
    >('../server/api/organizations/[organizationId]/teams.get')

    const result = await handler(event({ params: { organizationId: 'org_1' } }))

    expect(result).toEqual([{ id: 'team_1', organizationId: 'org_1', name: 'Product' }])
    expect(serverConvexQueryCalls).toEqual([
      {
        functionReference: 'organizationAccess.getCapabilities',
        args: { organizationId: 'org_1' },
        options: { auth: 'required' },
      },
    ])
    expect(firstFetchCall()?.url).toBe('http://app.test/api/auth/organization/list-user-teams')
  })
})
