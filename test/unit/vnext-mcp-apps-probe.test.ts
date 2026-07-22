import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import {
  McpUiResourceMetaSchema,
  McpUiToolMetaSchema,
} from '@modelcontextprotocol/ext-apps/app-bridge'
import { describe, expect, it } from 'vitest'

import { proveNotesDashboardBrowserBoundary } from '../../internal/labs/mcp-topology/apps/notes-dashboard/browser-proof'
import { buildNotesDashboard } from '../../internal/labs/mcp-topology/apps/notes-dashboard/build'
import { NeutralNotesApplication } from '../../internal/labs/mcp-topology/neutral/notes-application'
import {
  createNitroNotesMcpHandler,
  NOTES_DASHBOARD_RESOURCE_MIME_TYPE,
  NOTES_DASHBOARD_RESOURCE_URI,
  type NitroNotesVerifiedAccess,
} from '../../internal/labs/mcp-topology/nitro/notes-handler'

const ACCESS = Object.freeze<NitroNotesVerifiedAccess>({
  actor: { role: 'owner', subject: 'alice', tenantId: 'tenant-a' },
  authInfo: {
    clientId: 'apps-client',
    scopes: ['notes:read', 'notes:write'],
    token: 'nitro-apps-token-must-not-escape',
  },
})

function createApplication(): NeutralNotesApplication {
  return new NeutralNotesApplication(
    {
      notes: [
        {
          body: 'Alpha body',
          id: 'note-a',
          title: 'Alpha',
          workspaceId: 'workspace-a',
        },
      ],
      workspaces: [{ id: 'workspace-a', name: 'Workspace A', tenantId: 'tenant-a' }],
    },
    () => 1_800_000_000_000,
  )
}

function connectClient(
  handler: ReturnType<typeof createNitroNotesMcpHandler>,
  supportsApps: boolean,
): { client: Client; connect: Promise<void>; requestBodies: string[]; responseBodies: string[] } {
  const requestBodies: string[] = []
  const responseBodies: string[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    requestBodies.push(await request.clone().text())
    const response = await handler.fetch(request, ACCESS)
    responseBodies.push(await response.clone().text())
    return response
  }
  const transport = new StreamableHTTPClientTransport(new URL('https://mcp-apps.invalid/mcp'), {
    fetch,
  })
  const client = new Client(
    { name: supportsApps ? 'apps-capable-client' : 'baseline-client', version: '0.0.0' },
    supportsApps
      ? {
          capabilities: {
            extensions: {
              'io.modelcontextprotocol/ui': {
                mimeTypes: [NOTES_DASHBOARD_RESOURCE_MIME_TYPE],
              },
            },
          },
        }
      : undefined,
  )
  return { client, connect: client.connect(transport), requestBodies, responseBodies }
}

describe('vNext MCP Apps private topology probe', () => {
  it('rejects malformed or oversized App resources before creating the Nitro handler', () => {
    const application = createApplication()
    expect(() => createNitroNotesMcpHandler(() => application, '/mcp', '<html></html>')).toThrow(
      'The private MCP App must be one bounded HTML document',
    )
    expect(() =>
      createNitroNotesMcpHandler(
        () => application,
        '/mcp',
        `<!doctype html>${'x'.repeat(512 * 1024)}`,
      ),
    ).toThrow('The private MCP App must be one bounded HTML document')
  })

  it('serves one credential-free Vue App with useful fallback through the Nitro candidate', async () => {
    const build = await buildNotesDashboard()
    const handler = createNitroNotesMcpHandler(() => createApplication(), '/mcp', build.appHtml)
    const supported = connectClient(handler, true)
    const unsupported = connectClient(handler, false)

    try {
      await Promise.all([supported.connect, unsupported.connect])

      const [supportedTools, unsupportedTools] = await Promise.all([
        supported.client.listTools(),
        unsupported.client.listTools(),
      ])
      const supportedSearch = supportedTools.tools.find((tool) => tool.name === 'search_notes')
      const unsupportedSearch = unsupportedTools.tools.find((tool) => tool.name === 'search_notes')
      expect(supportedSearch?._meta).toEqual({
        ui: {
          resourceUri: NOTES_DASHBOARD_RESOURCE_URI,
          visibility: ['model', 'app'],
        },
      })
      expect(unsupportedSearch?._meta).toEqual(supportedSearch?._meta)
      expect(
        McpUiToolMetaSchema.parse((supportedSearch?._meta as { ui?: unknown } | undefined)?.ui),
      ).toEqual(supportedSearch?._meta?.ui)

      const dashboard = await supported.client.readResource({ uri: NOTES_DASHBOARD_RESOURCE_URI })
      expect(dashboard.contents).toHaveLength(1)
      const dashboardContent = dashboard.contents[0]!
      expect(dashboardContent).toEqual({
        _meta: {
          ui: {
            csp: {
              baseUriDomains: [],
              connectDomains: [],
              frameDomains: [],
              resourceDomains: [],
            },
            permissions: {},
            prefersBorder: true,
          },
        },
        mimeType: NOTES_DASHBOARD_RESOURCE_MIME_TYPE,
        text: build.appHtml,
        uri: NOTES_DASHBOARD_RESOURCE_URI,
      })
      expect(
        McpUiResourceMetaSchema.parse((dashboardContent._meta as { ui?: unknown } | undefined)?.ui),
      ).toEqual(dashboardContent._meta?.ui)

      const fallback = await unsupported.client.callTool({
        arguments: { query: 'alpha', workspaceId: 'workspace-a' },
        name: 'search_notes',
      })
      expect(fallback).toMatchObject({
        content: [{ type: 'text' }],
        structuredContent: { matches: [{ id: 'note-a', title: 'Alpha' }] },
      })
      const proof = await proveNotesDashboardBrowserBoundary({
        build,
        callTool: (call) => supported.client.callTool(call),
      })
      expect(proof.appHtmlBytes).toBeGreaterThan(0)
      expect(proof.appHtmlBytes).toBeLessThanOrEqual(512 * 1024)
      expect(proof.toolCalls).toEqual([
        {
          arguments: { limit: 5, query: '', workspaceId: 'workspace-a' },
          name: 'search_notes',
        },
      ])

      const appModules = build.appModules.join('\n')
      expect(appModules).toMatch(/node_modules\/\.pnpm\/@vue\+/u)
      expect(appModules).toContain('@modelcontextprotocol/ext-apps')
      for (const moduleId of build.appModules) {
        expect(moduleId).not.toContain('/src/runtime/')
        expect(moduleId).not.toContain('@modelcontextprotocol/sdk/dist/esm/client/')
        expect(moduleId).not.toMatch(
          /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:@modelcontextprotocol\/(?:client|server)|better-auth|convex|h3|nitro|nuxt)(?:\/|$)/u,
        )
      }
      for (const moduleId of build.hostModules) {
        expect(moduleId).not.toContain('/src/runtime/')
        expect(moduleId).not.toMatch(
          /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:@modelcontextprotocol\/(?:client|server)|better-auth|convex|h3|nitro|nuxt)(?:\/|$)/u,
        )
      }
      expect(build.appHtml).not.toContain(ACCESS.authInfo.token)
      expect(JSON.stringify(dashboard)).not.toContain(ACCESS.authInfo.token)
      expect([...supported.responseBodies, ...unsupported.responseBodies].join('\n')).not.toContain(
        ACCESS.authInfo.token,
      )

      const supportedInitialize = JSON.parse(supported.requestBodies[0]!) as unknown
      const unsupportedInitialize = JSON.parse(unsupported.requestBodies[0]!) as unknown
      expect(supportedInitialize).toMatchObject({
        method: 'initialize',
        params: {
          capabilities: {
            extensions: {
              'io.modelcontextprotocol/ui': {
                mimeTypes: [NOTES_DASHBOARD_RESOURCE_MIME_TYPE],
              },
            },
          },
        },
      })
      expect(unsupportedInitialize).toMatchObject({
        method: 'initialize',
        params: { capabilities: {} },
      })
    } finally {
      await Promise.allSettled([supported.client.close(), unsupported.client.close()])
      await handler.close()
    }
  }, 120_000)
})
