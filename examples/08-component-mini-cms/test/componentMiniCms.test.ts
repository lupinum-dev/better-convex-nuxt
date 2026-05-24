/// <reference types="vite/client" />

import { readFileSync } from 'node:fs'

import { createIdentityForwardingEnvelopeArgs } from '@lupinum/trellis/backend'
import { createTestContext } from '@lupinum/trellis/testing'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../convex/_generated/api'
import componentSchema from '../convex/components/miniCms/schema'
import schema from '../convex/schema'
import { modules } from '../convex/test.setup'
import { getCapabilitiesForPrincipal } from '../server/lib/mcp-auth'
const componentModules = import.meta.glob('../convex/components/miniCms/**/*.ts', {
  eager: false,
})
const IDENTITY_FORWARDING_KEY = 'component-mini-cms-test-identity-forwarding-key'
const bridgePrincipal = {
  kind: 'agent',
  agentId: 'bridge-key',
  subject: 'agent:bridge-key',
  provider: 'mcp',
} as const
const previewPrincipal = {
  kind: 'agent',
  agentId: 'preview-key',
  subject: 'agent:preview-key',
  provider: 'mcp',
} as const

function createCtx() {
  const ctx = createTestContext({ schema, modules, identityForwardingKey: IDENTITY_FORWARDING_KEY })
  ctx.raw.registerComponent('miniCms', componentSchema, componentModules)
  return ctx
}

function bridgeArgs(
  appArgs: Record<string, unknown>,
  options: {
    caller: typeof bridgePrincipal | typeof previewPrincipal
    purpose: 'query' | 'mutation'
    functionRef: string
  },
) {
  const args = {
    ...appArgs,
    ...createIdentityForwardingEnvelopeArgs({
      args: {},
      caller: options.caller,
      key: IDENTITY_FORWARDING_KEY,
      transport: 'bridge',
      purpose: options.purpose,
      functionRef: options.functionRef,
    }),
  }
  expect(args).not.toHaveProperty('caller')
  return args
}

describe('example 08 component mini cms', () => {
  it('does not ship a public demo MCP bearer token', () => {
    const config = readFileSync(new URL('../nuxt.config.ts', import.meta.url), 'utf8')
    const studio = readFileSync(
      new URL('../app/features/pages/components/MiniCmsStudioPage.vue', import.meta.url),
      'utf8',
    )

    expect(config).toContain('demoMcpToken: process.env.DEMO_MCP_TOKEN')
    expect(config).not.toContain('demo-mini-cms-token')
    expect(config).not.toContain('public: {')
    expect(studio).not.toContain('runtimeConfig.public.demoMcpToken')
    expect(studio).not.toContain('Authorization: Bearer')
  })

  it('lets anonymous callers read published pages only', async () => {
    const ctx = createCtx()

    const pageId = await (
      ctx.raw.withIdentity({
        subject: 'editor-public',
        tokenIdentifier: 'editor-public',
        email: 'editor-public@example.com',
        name: 'Editor Public',
      }) as {
        mutation: (fn: unknown, args: Record<string, unknown>) => Promise<string>
      }
    ).mutation(api.features.pages.domain.create, {
      slug: 'welcome',
      title: 'Welcome',
      draftBody: 'Public page body',
    })

    await (
      ctx.raw.withIdentity({
        subject: 'editor-public',
        tokenIdentifier: 'editor-public',
        email: 'editor-public@example.com',
        name: 'Editor Public',
      }) as {
        mutation: (fn: unknown, args: Record<string, unknown>) => Promise<unknown>
      }
    ).mutation(api.features.pages.domain.publish, { id: pageId })

    const published = await ctx.raw.query(api.features.pages.domain.listPublished, {})
    expect(published).toHaveLength(1)
    expect(published[0]).toMatchObject({
      slug: 'welcome',
      title: 'Welcome',
      body: 'Public page body',
      status: 'published',
    })

    const page = await ctx.raw.query(api.features.pages.domain.getPublished, { slug: 'welcome' })
    expect(page).toMatchObject({
      slug: 'welcome',
      title: 'Welcome',
    })

    await expect(ctx.raw.query(api.features.pages.domain.listStudio, {})).rejects.toThrow(
      'Forbidden: Manage pages',
    )
  })

  it('lets authenticated browser users create, save, and publish drafts', async () => {
    const ctx = createCtx()
    const editor = ctx.raw.withIdentity({
      subject: 'editor-workflow',
      tokenIdentifier: 'editor-workflow',
      email: 'editor-workflow@example.com',
      name: 'Editor Workflow',
    }) as {
      mutation: (fn: unknown, args: Record<string, unknown>) => Promise<any>
      query: (fn: unknown, args: Record<string, unknown>) => Promise<any>
    }

    const id = await editor.mutation(api.features.pages.domain.create, {
      slug: 'hello-world',
      title: 'Hello world',
      draftBody: 'Draft v1',
    })

    await editor.mutation(api.features.pages.domain.save, {
      id,
      slug: 'hello-world',
      title: 'Hello from studio',
      draftBody: 'Draft v2',
    })

    await editor.mutation(api.features.pages.domain.publish, { id })

    const pages = await editor.query(api.features.pages.domain.listStudio, {})
    expect(pages).toHaveLength(1)
    expect(pages[0]).toMatchObject({
      _id: id,
      slug: 'hello-world',
      title: 'Hello from studio',
      draftBody: 'Draft v2',
      publishedBody: 'Draft v2',
      status: 'published',
    })
  })

  it('publishes through the action-backed operation path used by MCP', async () => {
    const ctx = createCtx()
    const editor = ctx.raw.withIdentity({
      subject: 'editor-action-publish',
      tokenIdentifier: 'editor-action-publish',
      email: 'editor-action-publish@example.com',
      name: 'Editor Action Publish',
    }) as {
      action: (fn: unknown, args: Record<string, unknown>) => Promise<any>
      mutation: (fn: unknown, args: Record<string, unknown>) => Promise<any>
      query: (fn: unknown, args: Record<string, unknown>) => Promise<any>
    }

    const id = await editor.mutation(api.features.pages.domain.create, {
      slug: 'action-backed',
      title: 'Action backed',
      draftBody: 'Published by action',
    })

    await expect(editor.action(api.features.pages.domain.publishAction, { id })).resolves.toEqual({
      pageId: id,
      published: true,
    })

    const page = await editor.query(api.features.pages.domain.getPublished, {
      slug: 'action-backed',
    })
    expect(page).toMatchObject({
      _id: id,
      body: 'Published by action',
      status: 'published',
    })
  })

  it('binds the MCP publish tool to the action-backed operation ref', () => {
    const source = readFileSync(
      new URL('../server/mcp/tools/publish-page.ts', import.meta.url),
      'utf8',
    )

    expect(source).toContain('tool.operation(publishPageDescriptor')
    expect(source).toContain('transportExecuteOperationRef(')
    expect(source).toContain('publishPageDescriptor')
    expect(source).toContain('api.features.pages.domain.publishAction')
    expect(source).toContain("executeOperation: 'action'")
    expect(source).toContain('previewOperationRef(publishPageDescriptor')
    expect(source).toContain('api.features.pages.domain.previewPublish')
  })

  it('rejects forwarded principals on public root wrappers', async () => {
    const ctx = createCtx()

    const withIdentity = ctx.raw.withIdentity({
      subject: 'browser-auth-user',
      tokenIdentifier: 'browser-auth-user',
      email: 'browser@example.com',
      name: 'Browser User',
    })

    await expect(
      (
        withIdentity as {
          mutation: (fn: unknown, args: Record<string, unknown>) => Promise<string>
        }
      ).mutation(api.features.pages.domain.create, {
        slug: 'forwarded-agent',
        title: 'Forwarded agent page',
        draftBody: 'Created by the forwarded caller',
        caller: {
          kind: 'agent',
          agentId: 'demo-key',
          subject: 'agent:demo-key',
          provider: 'mcp',
        },
      }),
    ).rejects.toThrow('Unexpected field `caller`')
  })

  it('forwards caller unchanged through the internal component bridge', async () => {
    const ctx = createCtx()

    const id = await ctx.raw.mutation(
      internal.features.pages.bridge.create,
      bridgeArgs(
        {
          slug: 'bridge-owned',
          title: 'Bridge owned',
          draftBody: 'Bridge draft',
        },
        {
          caller: bridgePrincipal,
          purpose: 'mutation',
          functionRef: 'features/pages/domain:create',
        },
      ),
    )

    const drafts = await ctx.raw.query(
      internal.features.pages.bridge.listDraft,
      bridgeArgs(
        {},
        {
          caller: bridgePrincipal,
          purpose: 'query',
          functionRef: 'features/pages/domain:listDraft',
        },
      ),
    )
    expect(drafts.find((page: { _id: string }) => page._id === id)).toMatchObject({
      authorId: 'agent:bridge-key',
      slug: 'bridge-owned',
    })
  })

  it('rejects raw caller args on internal root bridge wrappers', async () => {
    const ctx = createCtx()

    await expect(
      ctx.raw.mutation(internal.features.pages.bridge.create, {
        slug: 'raw-bridge-caller',
        title: 'Raw bridge caller',
        draftBody: 'This must not be trusted',
        caller: bridgePrincipal,
      }),
    ).rejects.toThrow('Unexpected field `caller`')
  })

  it('returns the publish preview from the component operation', async () => {
    const ctx = createCtx()

    const id = await ctx.raw.mutation(
      internal.features.pages.bridge.create,
      bridgeArgs(
        {
          slug: 'launch-notes',
          title: 'Launch notes',
          draftBody: 'Version one',
        },
        {
          caller: previewPrincipal,
          purpose: 'mutation',
          functionRef: 'features/pages/domain:create',
        },
      ),
    )

    const preview = await ctx.raw.query(
      internal.features.pages.bridge.previewPublish,
      bridgeArgs(
        { id },
        {
          caller: previewPrincipal,
          purpose: 'query',
          functionRef: 'features/pages/operations:previewPublish',
        },
      ),
    )
    expect(preview).toMatchObject({
      details: {
        summary: 'Publish "Launch notes" at /launch-notes',
        affects: { pages: 1 },
      },
      confirm: {
        operation: 'pages.publish',
        affectedCounts: { pages: 1 },
      },
    })
  })

  it('uses a smaller anonymous MCP recordAccess snapshot than the MCP-authenticated snapshot', () => {
    expect(getCapabilitiesForPrincipal({ kind: 'anonymous', subject: 'system:anonymous' })).toEqual(
      {
        listPublishedPages: true,
        listDraftPages: false,
        createPage: false,
        saveDraft: false,
        publishPage: false,
      },
    )

    expect(
      getCapabilitiesForPrincipal({
        kind: 'agent',
        agentId: 'demo-key',
        subject: 'agent:demo-key',
        provider: 'mcp',
      }),
    ).toEqual({
      listPublishedPages: true,
      listDraftPages: true,
      createPage: true,
      saveDraft: true,
      publishPage: true,
    })
  })
})
