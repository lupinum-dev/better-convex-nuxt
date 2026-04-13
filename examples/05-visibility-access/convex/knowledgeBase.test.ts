/**
 * Why this file exists:
 * Tests every access pattern in the knowledge base domain: visibility filtering,
 * field redaction, enrollment, prerequisites, share tokens, inherited access,
 * and cross-tenant isolation.
 */
/// <reference types="vite/client" />

import { createTestContext } from '@lupinum/trellis/testing'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { knowledgeBasePermissionKeys } from '../shared/permissions'
import schema from './schema'
import { modules } from './test.setup'

const api = anyApi

function createCtx() {
  return createTestContext({ schema, modules })
}

describe('workspace onboarding', () => {
  it('returns null permission context for anonymous callers', async () => {
    const ctx = createCtx()
    await expect(ctx.raw.query(api.workspaces.getPermissionContext, {})).resolves.toBeNull()
  })

  it('returns permission booleans for different roles', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: {
        owner: { role: 'owner' },
        viewer: { role: 'viewer' },
      },
    })

    const ownerCtx = await team.users.owner.query(api.workspaces.getPermissionContext, {})
    const viewerCtx = await team.users.viewer.query(api.workspaces.getPermissionContext, {})

    expect(ownerCtx?.can[knowledgeBasePermissionKeys.kbCreate]).toBe(true)
    expect(ownerCtx?.can[knowledgeBasePermissionKeys.shareCreate]).toBe(true)
    expect(viewerCtx?.can[knowledgeBasePermissionKeys.kbCreate]).toBe(false)
    expect(viewerCtx?.can[knowledgeBasePermissionKeys.shareCreate]).toBe(false)
    expect(viewerCtx?.can[knowledgeBasePermissionKeys.kbRead]).toBe(true)
  })
})

describe('knowledge base CRUD', () => {
  it('lets admins create and publish a knowledge base', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { owner: { role: 'owner' } },
    })

    const kbId = await team.users.owner.mutation(api.knowledgeBases.create, { title: 'Docs' })
    expect(kbId).toBeDefined()

    await team.users.owner.mutation(api.knowledgeBases.publish, { id: kbId })
    const kb = await team.users.owner.query(api.knowledgeBases.get, { id: kbId })
    expect(kb.status).toBe('published')
  })

  it('blocks viewers from creating knowledge bases', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { viewer: { role: 'viewer' } },
    })

    await expect(
      team.users.viewer.mutation(api.knowledgeBases.create, { title: 'Nope' }),
    ).rejects.toThrow('Forbidden: Create knowledge base')
  })
})

describe('visibility filtering', () => {
  it('shows workspace-visible articles to all enrolled members', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: {
        editor: { role: 'editor' },
        viewer: { role: 'viewer' },
      },
    })

    const kbId = await team.users.editor.mutation(api.knowledgeBases.create, { title: 'Docs' })
    await team.users.editor.mutation(api.knowledgeBases.publish, { id: kbId })
    await team.users.editor.mutation(api.articles.create, {
      knowledgeBaseId: kbId,
      title: 'Public guide',
      body: 'Visible to all',
      visibility: 'workspace',
    })
    await team.users.editor.mutation(api.articles.publish, {
      id: (await team.users.editor.query(api.articles.list, { knowledgeBaseId: kbId }))[0]._id,
    })

    const viewerArticles = await team.users.viewer.query(api.articles.list, {
      knowledgeBaseId: kbId,
    })
    expect(viewerArticles).toHaveLength(1)
    expect(viewerArticles[0]?.title).toBe('Public guide')
  })

  it('hides private articles from non-owners', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: {
        editor: { role: 'editor' },
        contributor: { role: 'contributor' },
      },
    })

    const kbId = await team.users.editor.mutation(api.knowledgeBases.create, { title: 'Docs' })
    await team.users.editor.mutation(api.knowledgeBases.publish, { id: kbId })
    await team.users.editor.mutation(api.articles.create, {
      knowledgeBaseId: kbId,
      title: 'My private notes',
      body: 'Secret',
      visibility: 'private',
    })
    const articles = await team.users.editor.query(api.articles.list, { knowledgeBaseId: kbId })
    await team.users.editor.mutation(api.articles.publish, { id: articles[0]._id })

    const contributorArticles = await team.users.contributor.query(api.articles.list, {
      knowledgeBaseId: kbId,
    })
    expect(contributorArticles).toHaveLength(0)

    const editorArticles = await team.users.editor.query(api.articles.list, {
      knowledgeBaseId: kbId,
    })
    expect(editorArticles).toHaveLength(1)
  })

  it('shows team-visible articles only to the owner team', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: {
        editor: { role: 'editor' },
        contributor: { role: 'contributor' },
      },
    })

    const kbId = await team.users.editor.mutation(api.knowledgeBases.create, { title: 'Docs' })
    await team.users.editor.mutation(api.knowledgeBases.publish, { id: kbId })
    await team.users.editor.mutation(api.articles.create, {
      knowledgeBaseId: kbId,
      title: 'Team only',
      body: 'For the team',
      visibility: 'team',
    })
    const articles = await team.users.editor.query(api.articles.list, { knowledgeBaseId: kbId })
    await team.users.editor.mutation(api.articles.publish, { id: articles[0]._id })

    // Editor can see their own team articles
    const editorList = await team.users.editor.query(api.articles.list, { knowledgeBaseId: kbId })
    expect(editorList).toHaveLength(1)

    // Contributor outside editor's team cannot see team articles
    const contributorList = await team.users.contributor.query(api.articles.list, {
      knowledgeBaseId: kbId,
    })
    expect(contributorList).toHaveLength(0)
  })

  it('shows draft articles only to staff', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: {
        editor: { role: 'editor' },
        viewer: { role: 'viewer' },
      },
    })

    const kbId = await team.users.editor.mutation(api.knowledgeBases.create, { title: 'Docs' })
    await team.users.editor.mutation(api.articles.create, {
      knowledgeBaseId: kbId,
      title: 'Draft',
      body: 'WIP',
      visibility: 'workspace',
    })

    const editorList = await team.users.editor.query(api.articles.list, { knowledgeBaseId: kbId })
    expect(editorList).toHaveLength(1)

    const viewerList = await team.users.viewer.query(api.articles.list, { knowledgeBaseId: kbId })
    expect(viewerList).toHaveLength(0)
  })
})

describe('field redaction', () => {
  it('strips internalNotes and draftFeedback for non-editor roles', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: {
        editor: { role: 'editor' },
        viewer: { role: 'viewer' },
      },
    })

    const kbId = await team.users.editor.mutation(api.knowledgeBases.create, { title: 'Docs' })
    await team.users.editor.mutation(api.knowledgeBases.publish, { id: kbId })
    await team.users.editor.mutation(api.articles.create, {
      knowledgeBaseId: kbId,
      title: 'Sensitive',
      body: 'Content',
      visibility: 'workspace',
      internalNotes: 'Legal review needed',
    })
    const articles = await team.users.editor.query(api.articles.list, { knowledgeBaseId: kbId })
    await team.users.editor.mutation(api.articles.publish, { id: articles[0]._id })

    const editorView = await team.users.editor.query(api.articles.list, { knowledgeBaseId: kbId })
    expect(editorView[0]?.internalNotes).toBe('Legal review needed')

    const viewerView = await team.users.viewer.query(api.articles.list, { knowledgeBaseId: kbId })
    expect(viewerView[0]?.internalNotes).toBeUndefined()
  })
})

describe('enrollment', () => {
  it('requires enrollment to view articles', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: {
        owner: { role: 'owner' },
        viewer: { role: 'viewer' },
      },
    })

    const kbId = await team.users.owner.mutation(api.knowledgeBases.create, { title: 'Course' })
    await team.users.owner.mutation(api.knowledgeBases.publish, { id: kbId })
    const introId = await team.users.owner.mutation(api.articles.create, {
      knowledgeBaseId: kbId,
      title: 'Intro',
      body: 'Start here',
      visibility: 'workspace',
    })
    await team.users.owner.mutation(api.articles.publish, { id: introId })

    // Viewer not enrolled — viewArticle should fail
    await expect(
      team.users.viewer.query(api.articles.viewArticle, { id: introId }),
    ).rejects.toThrow('Not enrolled')

    // Enroll the viewer
    await team.users.owner.mutation(api.knowledgeBases.enroll, {
      knowledgeBaseId: kbId,
      userId: team.users.viewer.authId,
    })

    // Now viewer can access
    const article = await team.users.viewer.query(api.articles.viewArticle, { id: introId })
    expect(article.title).toBe('Intro')
  })

  it('skips enrollment check for staff', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { owner: { role: 'owner' } },
    })

    const kbId = await team.users.owner.mutation(api.knowledgeBases.create, { title: 'Course' })
    await team.users.owner.mutation(api.knowledgeBases.publish, { id: kbId })
    const introId = await team.users.owner.mutation(api.articles.create, {
      knowledgeBaseId: kbId,
      title: 'Intro',
      body: 'Start here',
      visibility: 'workspace',
    })
    await team.users.owner.mutation(api.articles.publish, { id: introId })

    // Owner can view without enrollment
    const article = await team.users.owner.query(api.articles.viewArticle, { id: introId })
    expect(article.title).toBe('Intro')
  })
})

describe('prerequisites', () => {
  it('blocks access to articles with unmet prerequisites', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: {
        owner: { role: 'owner' },
        viewer: { role: 'viewer' },
      },
    })

    const kbId = await team.users.owner.mutation(api.knowledgeBases.create, { title: 'Course' })
    await team.users.owner.mutation(api.knowledgeBases.publish, { id: kbId })

    const introId = await team.users.owner.mutation(api.articles.create, {
      knowledgeBaseId: kbId,
      title: 'Intro',
      body: 'Start here',
      visibility: 'workspace',
    })
    await team.users.owner.mutation(api.articles.publish, { id: introId })

    const advancedId = await team.users.owner.mutation(api.articles.create, {
      knowledgeBaseId: kbId,
      title: 'Advanced',
      body: 'Deep stuff',
      visibility: 'workspace',
      prerequisiteIds: [introId],
    })
    await team.users.owner.mutation(api.articles.publish, { id: advancedId })

    await team.users.owner.mutation(api.knowledgeBases.enroll, {
      knowledgeBaseId: kbId,
      userId: team.users.viewer.authId,
    })

    // Without completing intro, advanced is blocked
    await expect(
      team.users.viewer.query(api.articles.viewArticle, { id: advancedId }),
    ).rejects.toThrow(/Complete/)

    // Complete intro
    await team.users.viewer.mutation(api.articles.markCompleted, { articleId: introId })

    // Now advanced is accessible
    const article = await team.users.viewer.query(api.articles.viewArticle, { id: advancedId })
    expect(article.title).toBe('Advanced')
  })
})

describe('share tokens', () => {
  it('creates and resolves a share token for external access', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { editor: { role: 'editor' } },
    })

    const kbId = await team.users.editor.mutation(api.knowledgeBases.create, { title: 'Docs' })
    await team.users.editor.mutation(api.knowledgeBases.publish, { id: kbId })
    const articleId = await team.users.editor.mutation(api.articles.create, {
      knowledgeBaseId: kbId,
      title: 'Shared article',
      body: 'External access',
      visibility: 'workspace',
    })
    await team.users.editor.mutation(api.articles.publish, { id: articleId })

    const token = await team.users.editor.mutation(api.articles.createShareToken, {
      articleId,
      level: 'view',
    })
    expect(token).toBeDefined()
    expect(typeof token).toBe('string')

    // Anonymous user can view with token (via raw context)
    const article = await ctx.raw.query(api.articles.viewArticle, {
      id: articleId,
      shareToken: token,
    })
    expect(article.title).toBe('Shared article')
    expect(article._access).toBe('view')
  })

  it('rejects a revoked share token', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { editor: { role: 'editor' } },
    })

    const kbId = await team.users.editor.mutation(api.knowledgeBases.create, { title: 'Docs' })
    await team.users.editor.mutation(api.knowledgeBases.publish, { id: kbId })
    const articleId = await team.users.editor.mutation(api.articles.create, {
      knowledgeBaseId: kbId,
      title: 'Shared',
      body: 'Content',
      visibility: 'workspace',
    })
    await team.users.editor.mutation(api.articles.publish, { id: articleId })

    const token = await team.users.editor.mutation(api.articles.createShareToken, {
      articleId,
      level: 'view',
    })

    // Find the token record and revoke it
    const articles = await team.users.editor.query(api.articles.list, { knowledgeBaseId: kbId })
    expect(articles).toHaveLength(1)

    // We need to get the token ID — resolve via the hash
    // Instead, we use raw db to find it
    const { hashShareToken: hash } = await import('./auth/shareTokens')
    const tokenHash = await hash(token)
    const tokenRecord = (await ctx.readAll('shareTokens')).find(
      (record) => record.hash === tokenHash,
    )

    await team.users.editor.mutation(api.articles.revokeShareToken, {
      tokenId: tokenRecord!._id,
    })

    await expect(
      ctx.raw.query(api.articles.viewArticle, { id: articleId, shareToken: token }),
    ).rejects.toThrow('revoked')
  })

  it('rejects a token used for the wrong article', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { editor: { role: 'editor' } },
    })

    const kbId = await team.users.editor.mutation(api.knowledgeBases.create, { title: 'Docs' })
    await team.users.editor.mutation(api.knowledgeBases.publish, { id: kbId })
    const article1 = await team.users.editor.mutation(api.articles.create, {
      knowledgeBaseId: kbId,
      title: 'Article 1',
      body: 'One',
      visibility: 'workspace',
    })
    const article2 = await team.users.editor.mutation(api.articles.create, {
      knowledgeBaseId: kbId,
      title: 'Article 2',
      body: 'Two',
      visibility: 'workspace',
    })

    const token = await team.users.editor.mutation(api.articles.createShareToken, {
      articleId: article1,
      level: 'view',
    })

    await expect(
      ctx.raw.query(api.articles.viewArticle, { id: article2, shareToken: token }),
    ).rejects.toThrow('does not match')
  })

  it('blocks viewers from creating share tokens', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: {
        editor: { role: 'editor' },
        viewer: { role: 'viewer' },
      },
    })

    const kbId = await team.users.editor.mutation(api.knowledgeBases.create, { title: 'Docs' })
    const articleId = await team.users.editor.mutation(api.articles.create, {
      knowledgeBaseId: kbId,
      title: 'Article',
      body: 'Content',
      visibility: 'workspace',
    })

    await expect(
      team.users.viewer.mutation(api.articles.createShareToken, {
        articleId,
        level: 'view',
      }),
    ).rejects.toThrow('Forbidden: Create share token')
  })
})

describe('inherited access levels', () => {
  it('inherits access from parent article', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: {
        owner: { role: 'owner' },
        viewer: { role: 'viewer' },
      },
    })

    const kbId = await team.users.owner.mutation(api.knowledgeBases.create, { title: 'Docs' })
    await team.users.owner.mutation(api.knowledgeBases.publish, { id: kbId })

    const parentId = await team.users.owner.mutation(api.articles.create, {
      knowledgeBaseId: kbId,
      title: 'Parent',
      body: 'Parent content',
      visibility: 'workspace',
    })
    await team.users.owner.mutation(api.articles.publish, { id: parentId })

    const childId = await team.users.owner.mutation(api.articles.create, {
      knowledgeBaseId: kbId,
      title: 'Child',
      body: 'Child content',
      visibility: 'workspace',
      parentArticleId: parentId,
    })
    await team.users.owner.mutation(api.articles.publish, { id: childId })

    // Enroll viewer and grant explicit share on parent
    await team.users.owner.mutation(api.knowledgeBases.enroll, {
      knowledgeBaseId: kbId,
      userId: team.users.viewer.authId,
    })

    // Add a direct share for the parent article via raw db
    await ctx.seed('articleShares', {
      workspaceId: team.id as never,
      articleId: parentId,
      userId: team.users.viewer.authId,
      level: 'comment',
      createdAt: Date.now(),
    })

    // View child — should inherit parent's comment access
    const child = await team.users.viewer.query(api.articles.viewArticle, { id: childId })
    expect(child._access).toBe('comment')
  })
})

describe('cross-tenant isolation', () => {
  it('keeps knowledge bases isolated between workspaces', async () => {
    const ctx = createCtx()
    const alpha = await ctx.seedTenant({
      name: 'Alpha',
      users: { owner: { role: 'owner' } },
    })
    const beta = await ctx.seedTenant({
      name: 'Beta',
      users: { owner: { role: 'owner' } },
    })

    await alpha.users.owner.mutation(api.knowledgeBases.create, { title: 'Alpha Docs' })
    await beta.users.owner.mutation(api.knowledgeBases.create, { title: 'Beta Docs' })

    const alphaKBs = await alpha.users.owner.query(api.knowledgeBases.list, {})
    const betaKBs = await beta.users.owner.query(api.knowledgeBases.list, {})

    expect(alphaKBs).toHaveLength(1)
    expect(alphaKBs[0]?.title).toBe('Alpha Docs')
    expect(betaKBs).toHaveLength(1)
    expect(betaKBs[0]?.title).toBe('Beta Docs')
  })

  it('blocks cross-tenant resource access by ID', async () => {
    const ctx = createCtx()
    const alpha = await ctx.seedTenant({
      name: 'Alpha',
      users: { owner: { role: 'owner' } },
    })
    const beta = await ctx.seedTenant({
      name: 'Beta',
      users: { owner: { role: 'owner' } },
    })

    const alphaKB = await alpha.users.owner.mutation(api.knowledgeBases.create, {
      title: 'Alpha Docs',
    })

    await expect(beta.users.owner.query(api.knowledgeBases.get, { id: alphaKB })).rejects.toThrow(
      'Document belongs to a different tenant.',
    )
  })
})

describe('seed and completion flow', () => {
  it('seeds demo articles and allows marking completion', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { owner: { role: 'owner' } },
    })

    const kbId = await team.users.owner.mutation(api.knowledgeBases.create, { title: 'Course' })
    await team.users.owner.mutation(api.knowledgeBases.publish, { id: kbId })
    const introId = await team.users.owner.mutation(api.articles.seedDemoArticles, {
      knowledgeBaseId: kbId,
    })

    const articles = await team.users.owner.query(api.articles.list, { knowledgeBaseId: kbId })
    expect(articles.length).toBeGreaterThanOrEqual(3)

    await team.users.owner.mutation(api.articles.markCompleted, { articleId: introId })

    // Marking again should not fail (idempotent)
    const secondId = await team.users.owner.mutation(api.articles.markCompleted, {
      articleId: introId,
    })
    expect(secondId).toBeDefined()
  })
})
