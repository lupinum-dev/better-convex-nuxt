/// <reference types="vite/client" />

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
const TRUSTED_FORWARDING_KEY = 'component-mini-cms-test-trusted-forwarding-key'

function createCtx() {
  const ctx = createTestContext({ schema, modules, trustedForwardingKey: TRUSTED_FORWARDING_KEY })
  ctx.raw.registerComponent('miniCms', componentSchema, componentModules)
  return ctx
}

describe('example 08 component mini cms', () => {
  it('lets anonymous callers read published pages only', async () => {
    const ctx = createCtx()

    const pageId = await (
      ctx.raw.withIdentity({
        subject: 'editor-public',
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

  it('rejects forwarded principals on public root wrappers', async () => {
    const ctx = createCtx()

    const withIdentity = ctx.raw.withIdentity({
      subject: 'browser-auth-user',
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
        draftBody: 'Created by the forwarded principal',
        principal: {
          kind: 'agent',
          agentId: 'demo-key',
          subject: 'agent:demo-key',
          provider: 'mcp',
        },
      }),
    ).rejects.toThrow(
      'Forwarded identity fields are only allowed on verified trusted forwarding paths.',
    )
  })

  it('forwards principal unchanged through the internal component bridge', async () => {
    const ctx = createCtx()
    const agent = ctx.asPrincipal({
      kind: 'agent',
      agentId: 'bridge-key',
      subject: 'agent:bridge-key',
      provider: 'mcp',
    })

    const id = await agent.mutation(internal.features.pages.bridge.create, {
      slug: 'bridge-owned',
      title: 'Bridge owned',
      draftBody: 'Bridge draft',
    })

    const drafts = await agent.query(internal.features.pages.bridge.listDraft, {})
    expect(drafts.find((page: { _id: string }) => page._id === id)).toMatchObject({
      authorId: 'agent:bridge-key',
      slug: 'bridge-owned',
    })
  })

  it('returns the publish preview from the component operation', async () => {
    const ctx = createCtx()
    const agent = ctx.asPrincipal({
      kind: 'agent',
      agentId: 'preview-key',
      subject: 'agent:preview-key',
      provider: 'mcp',
    })

    const id = await agent.mutation(internal.features.pages.bridge.create, {
      slug: 'launch-notes',
      title: 'Launch notes',
      draftBody: 'Version one',
    })

    const preview = await agent.query(internal.features.pages.bridge.previewPublish, { id })
    expect(preview).toMatchObject({
      display: {
        summary: 'Publish "Launch notes" at /launch-notes',
        affects: { pages: 1 },
      },
      confirm: {
        operation: 'pages.publish',
        affectedCounts: { pages: 1 },
      },
    })
  })

  it('uses a smaller anonymous MCP capability snapshot than the MCP-authenticated snapshot', () => {
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
