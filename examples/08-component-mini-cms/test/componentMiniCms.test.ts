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

function createCtx() {
  const ctx = createTestContext({ schema, modules })
  ctx.raw.registerComponent('miniCms', componentSchema, componentModules)
  return ctx
}

describe('example 08 component mini cms', () => {
  it('lets anonymous callers read published pages only', async () => {
    const ctx = createCtx()

    const pageId = await ctx
      .asPrincipal({ kind: 'user', userId: 'editor-public' })
      .mutation(api.pages.create, {
        slug: 'welcome',
        title: 'Welcome',
        draftBody: 'Public page body',
      })

    await ctx
      .asPrincipal({ kind: 'user', userId: 'editor-public' })
      .mutation(api.pages.publish, { id: pageId })

    const published = await ctx.raw.query(api.pages.listPublished, {})
    expect(published).toHaveLength(1)
    expect(published[0]).toMatchObject({
      slug: 'welcome',
      title: 'Welcome',
      body: 'Public page body',
      status: 'published',
    })

    const page = await ctx.raw.query(api.pages.getPublished, { slug: 'welcome' })
    expect(page).toMatchObject({
      slug: 'welcome',
      title: 'Welcome',
    })

    await expect(ctx.raw.query(api.pages.listStudio, {})).rejects.toThrow('Forbidden: Manage pages')
  })

  it('lets authenticated browser users create, save, and publish drafts', async () => {
    const ctx = createCtx()
    const editor = ctx.asPrincipal({ kind: 'user', userId: 'editor-workflow' })

    const id = await editor.mutation(api.pages.create, {
      slug: 'hello-world',
      title: 'Hello world',
      draftBody: 'Draft v1',
    })

    await editor.mutation(api.pages.save, {
      id,
      slug: 'hello-world',
      title: 'Hello from studio',
      draftBody: 'Draft v2',
    })

    await editor.mutation(api.pages.publish, { id })

    const pages = await editor.query(api.pages.listStudio, {})
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

  it('derives the component actor from the forwarded principal instead of ctx.auth', async () => {
    const ctx = createCtx()

    const withIdentity = ctx.raw.withIdentity({
      subject: 'browser-auth-user',
      email: 'browser@example.com',
      name: 'Browser User',
    })

    const id = await (
      withIdentity as {
        mutation: (fn: unknown, args: Record<string, unknown>) => Promise<string>
      }
    ).mutation(api.pages.create, {
      slug: 'forwarded-agent',
      title: 'Forwarded agent page',
      draftBody: 'Created by the forwarded principal',
      principal: {
        kind: 'agent',
        agentId: 'demo-key',
        provider: 'mcp',
      },
    })

    const draftPages = await ctx
      .asPrincipal({ kind: 'agent', agentId: 'demo-key', provider: 'mcp' })
      .query(internal.miniCmsBridge.listDraftPages, {})

    expect(draftPages.find((page: { _id: string }) => page._id === id)).toMatchObject({
      authorId: 'agent:demo-key',
    })
  })

  it('forwards principal unchanged through the internal component bridge', async () => {
    const ctx = createCtx()
    const agent = ctx.asPrincipal({ kind: 'agent', agentId: 'bridge-key', provider: 'mcp' })

    const id = await agent.mutation(internal.miniCmsBridge.createPage, {
      slug: 'bridge-owned',
      title: 'Bridge owned',
      draftBody: 'Bridge draft',
    })

    const drafts = await agent.query(internal.miniCmsBridge.listDraftPages, {})
    expect(drafts.find((page: { _id: string }) => page._id === id)).toMatchObject({
      authorId: 'agent:bridge-key',
      slug: 'bridge-owned',
    })
  })

  it('returns the publish preview from the component operation', async () => {
    const ctx = createCtx()
    const agent = ctx.asPrincipal({ kind: 'agent', agentId: 'preview-key', provider: 'mcp' })

    const id = await agent.mutation(internal.miniCmsBridge.createPage, {
      slug: 'launch-notes',
      title: 'Launch notes',
      draftBody: 'Version one',
    })

    const preview = await agent.query(internal.miniCmsBridge.previewPublishPage, { id })
    expect(preview).toMatchObject({
      summary: 'Publish "Launch notes" at /launch-notes',
      affects: { pages: 1 },
    })
  })

  it('uses a smaller anonymous MCP capability snapshot than the MCP-authenticated snapshot', () => {
    expect(getCapabilitiesForPrincipal({ kind: 'anonymous' })).toEqual({
      listPublishedPages: true,
      listDraftPages: false,
      createPage: false,
      saveDraft: false,
      publishPage: false,
    })

    expect(
      getCapabilitiesForPrincipal({ kind: 'agent', agentId: 'demo-key', provider: 'mcp' }),
    ).toEqual({
      listPublishedPages: true,
      listDraftPages: true,
      createPage: true,
      saveDraft: true,
      publishPage: true,
    })
  })
})
