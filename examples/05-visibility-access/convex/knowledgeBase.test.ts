/**
 * Why this file exists:
 * Tests every access pattern in the knowledge base domain: visibility filtering,
 * field redaction, enrollment, prerequisites, share tokens, inherited access,
 * and cross-isolation.
 */
/// <reference types="vite/client" />

import { createTestContext } from '@lupinum/trellis/testing'
import type { FunctionReference } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { shareCreate } from './features/articles'
import { kbCreate, kbRead } from './features/knowledgeBases'
import schema from './schema'
import { modules } from './test.setup'

function createCtx() {
  return createTestContext({ schema, modules })
}

const revokeShareTokenMutation = api.features.articles.domain.revokeShareToken as FunctionReference<
  'mutation',
  'public',
  { tokenId: Id<'shareTokens'>; _confirmationToken: string },
  null
>

describe('workspace onboarding', () => {
  it('returns null access context for anonymous callers', async () => {
    const ctx = createCtx()
    await expect(ctx.raw.query(api.permissions.context.getAccessContext, {})).resolves.toBeNull()
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

    const ownerCtx = await team.users.owner.query(api.permissions.context.getAccessContext, {})
    const viewerCtx = await team.users.viewer.query(api.permissions.context.getAccessContext, {})

    expect(ownerCtx?.can[kbCreate.key]).toBe(true)
    expect(ownerCtx?.can[shareCreate.key]).toBe(true)
    expect(viewerCtx?.can[kbCreate.key]).toBe(false)
    expect(viewerCtx?.can[shareCreate.key]).toBe(false)
    expect(viewerCtx?.can[kbRead.key]).toBe(true)
  })
})

describe('knowledge base CRUD', () => {
  it('lets admins create and publish a knowledge base', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { owner: { role: 'owner' } },
    })

    const kbId = await team.users.owner.mutation(api.features.knowledgeBases.domain.create, {
      title: 'Docs',
    })
    expect(kbId).toBeDefined()

    await team.users.owner.mutation(api.features.knowledgeBases.domain.publish, { id: kbId })
    const kb = await team.users.owner.query(api.features.knowledgeBases.domain.get, { id: kbId })
    expect(kb.status).toBe('published')
  })

  it('blocks viewers from creating knowledge bases', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { viewer: { role: 'viewer' } },
    })

    await expect(
      team.users.viewer.mutation(api.features.knowledgeBases.domain.create, { title: 'Nope' }),
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

    const kbId = await team.users.editor.mutation(api.features.knowledgeBases.domain.create, {
      title: 'Docs',
    })
    await team.users.editor.mutation(api.features.knowledgeBases.domain.publish, { id: kbId })
    await team.users.editor.mutation(api.features.articles.domain.create, {
      knowledgeBaseId: kbId,
      title: 'Public guide',
      body: 'Visible to all',
      visibility: 'workspace',
    })
    const [draftArticle] = await team.users.editor.query(api.features.articles.domain.list, {
      knowledgeBaseId: kbId,
    })
    expect(draftArticle?._id).toBeDefined()
    await team.users.editor.mutation(api.features.articles.domain.publish, {
      id: draftArticle!._id,
    })

    const viewerArticles = await team.users.viewer.query(api.features.articles.domain.list, {
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

    const kbId = await team.users.editor.mutation(api.features.knowledgeBases.domain.create, {
      title: 'Docs',
    })
    await team.users.editor.mutation(api.features.knowledgeBases.domain.publish, { id: kbId })
    await team.users.editor.mutation(api.features.articles.domain.create, {
      knowledgeBaseId: kbId,
      title: 'My private notes',
      body: 'Secret',
      visibility: 'private',
    })
    const articles = await team.users.editor.query(api.features.articles.domain.list, {
      knowledgeBaseId: kbId,
    })
    const [privateArticle] = articles
    expect(privateArticle?._id).toBeDefined()
    await team.users.editor.mutation(api.features.articles.domain.publish, {
      id: privateArticle!._id,
    })

    const contributorArticles = await team.users.contributor.query(
      api.features.articles.domain.list,
      {
        knowledgeBaseId: kbId,
      },
    )
    expect(contributorArticles).toHaveLength(0)

    const editorArticles = await team.users.editor.query(api.features.articles.domain.list, {
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

    const kbId = await team.users.editor.mutation(api.features.knowledgeBases.domain.create, {
      title: 'Docs',
    })
    await team.users.editor.mutation(api.features.knowledgeBases.domain.publish, { id: kbId })
    await team.users.editor.mutation(api.features.articles.domain.create, {
      knowledgeBaseId: kbId,
      title: 'Team only',
      body: 'For the team',
      visibility: 'team',
    })
    const articles = await team.users.editor.query(api.features.articles.domain.list, {
      knowledgeBaseId: kbId,
    })
    const [teamArticle] = articles
    expect(teamArticle?._id).toBeDefined()
    await team.users.editor.mutation(api.features.articles.domain.publish, { id: teamArticle!._id })

    // Editor can see their own team articles
    const editorList = await team.users.editor.query(api.features.articles.domain.list, {
      knowledgeBaseId: kbId,
    })
    expect(editorList).toHaveLength(1)

    // Contributor outside editor's team cannot see team articles
    const contributorList = await team.users.contributor.query(api.features.articles.domain.list, {
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

    const kbId = await team.users.editor.mutation(api.features.knowledgeBases.domain.create, {
      title: 'Docs',
    })
    await team.users.editor.mutation(api.features.articles.domain.create, {
      knowledgeBaseId: kbId,
      title: 'Draft',
      body: 'WIP',
      visibility: 'workspace',
    })

    const editorList = await team.users.editor.query(api.features.articles.domain.list, {
      knowledgeBaseId: kbId,
    })
    expect(editorList).toHaveLength(1)

    const viewerList = await team.users.viewer.query(api.features.articles.domain.list, {
      knowledgeBaseId: kbId,
    })
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

    const kbId = await team.users.editor.mutation(api.features.knowledgeBases.domain.create, {
      title: 'Docs',
    })
    await team.users.editor.mutation(api.features.knowledgeBases.domain.publish, { id: kbId })
    await team.users.editor.mutation(api.features.articles.domain.create, {
      knowledgeBaseId: kbId,
      title: 'Sensitive',
      body: 'Content',
      visibility: 'workspace',
      internalNotes: 'Legal review needed',
    })
    const articles = await team.users.editor.query(api.features.articles.domain.list, {
      knowledgeBaseId: kbId,
    })
    const [sensitiveArticle] = articles
    expect(sensitiveArticle?._id).toBeDefined()
    await team.users.editor.mutation(api.features.articles.domain.publish, {
      id: sensitiveArticle!._id,
    })

    const editorView = await team.users.editor.query(api.features.articles.domain.list, {
      knowledgeBaseId: kbId,
    })
    expect(editorView[0]?.internalNotes).toBe('Legal review needed')

    const viewerView = await team.users.viewer.query(api.features.articles.domain.list, {
      knowledgeBaseId: kbId,
    })
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

    const kbId = await team.users.owner.mutation(api.features.knowledgeBases.domain.create, {
      title: 'Course',
    })
    await team.users.owner.mutation(api.features.knowledgeBases.domain.publish, { id: kbId })
    const introId = await team.users.owner.mutation(api.features.articles.domain.create, {
      knowledgeBaseId: kbId,
      title: 'Intro',
      body: 'Start here',
      visibility: 'workspace',
    })
    await team.users.owner.mutation(api.features.articles.domain.publish, { id: introId })

    // Viewer not enrolled — viewArticle should fail
    await expect(
      team.users.viewer.query(api.features.articles.domain.view, { id: introId }),
    ).rejects.toThrow('Not enrolled')

    // Enroll the viewer
    await team.users.owner.mutation(api.features.knowledgeBases.domain.enroll, {
      knowledgeBaseId: kbId,
      userId: team.users.viewer.id,
    })

    // Now viewer can access
    const article = await team.users.viewer.query(api.features.articles.domain.view, {
      id: introId,
    })
    expect(article.title).toBe('Intro')
  })

  it('skips enrollment check for staff', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { owner: { role: 'owner' } },
    })

    const kbId = await team.users.owner.mutation(api.features.knowledgeBases.domain.create, {
      title: 'Course',
    })
    await team.users.owner.mutation(api.features.knowledgeBases.domain.publish, { id: kbId })
    const introId = await team.users.owner.mutation(api.features.articles.domain.create, {
      knowledgeBaseId: kbId,
      title: 'Intro',
      body: 'Start here',
      visibility: 'workspace',
    })
    await team.users.owner.mutation(api.features.articles.domain.publish, { id: introId })

    // Owner can view without enrollment
    const article = await team.users.owner.query(api.features.articles.domain.view, { id: introId })
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

    const kbId = await team.users.owner.mutation(api.features.knowledgeBases.domain.create, {
      title: 'Course',
    })
    await team.users.owner.mutation(api.features.knowledgeBases.domain.publish, { id: kbId })

    const introId = await team.users.owner.mutation(api.features.articles.domain.create, {
      knowledgeBaseId: kbId,
      title: 'Intro',
      body: 'Start here',
      visibility: 'workspace',
    })
    await team.users.owner.mutation(api.features.articles.domain.publish, { id: introId })

    const advancedId = await team.users.owner.mutation(api.features.articles.domain.create, {
      knowledgeBaseId: kbId,
      title: 'Advanced',
      body: 'Deep stuff',
      visibility: 'workspace',
      prerequisiteIds: [introId],
    })
    await team.users.owner.mutation(api.features.articles.domain.publish, { id: advancedId })

    await team.users.owner.mutation(api.features.knowledgeBases.domain.enroll, {
      knowledgeBaseId: kbId,
      userId: team.users.viewer.id,
    })

    // Without completing intro, advanced is blocked
    await expect(
      team.users.viewer.query(api.features.articles.domain.view, { id: advancedId }),
    ).rejects.toThrow(/Complete/)

    // Complete intro
    await team.users.viewer.mutation(api.features.articles.domain.markCompleted, {
      articleId: introId,
    })

    // Now advanced is accessible
    const article = await team.users.viewer.query(api.features.articles.domain.view, {
      id: advancedId,
    })
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

    const kbId = await team.users.editor.mutation(api.features.knowledgeBases.domain.create, {
      title: 'Docs',
    })
    await team.users.editor.mutation(api.features.knowledgeBases.domain.publish, { id: kbId })
    const articleId = await team.users.editor.mutation(api.features.articles.domain.create, {
      knowledgeBaseId: kbId,
      title: 'Shared article',
      body: 'External access',
      visibility: 'workspace',
      internalNotes: 'Editors only',
    })
    await team.users.editor.mutation(api.features.articles.domain.publish, { id: articleId })

    const token = await team.users.editor.mutation(api.features.articles.domain.createShareToken, {
      articleId,
      level: 'view',
    })
    expect(token).toBeDefined()
    expect(typeof token).toBe('string')

    // Anonymous user can view with token (via raw context)
    const article = await ctx.raw.query(api.features.articles.domain.view, {
      id: articleId,
      shareToken: token,
    })
    expect(article.title).toBe('Shared article')
    expect(article._access).toBe('view')
    expect(article.internalNotes).toBeUndefined()
  })

  it('rejects a revoked share token', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { editor: { role: 'editor' } },
    })

    const kbId = await team.users.editor.mutation(api.features.knowledgeBases.domain.create, {
      title: 'Docs',
    })
    await team.users.editor.mutation(api.features.knowledgeBases.domain.publish, { id: kbId })
    const articleId = await team.users.editor.mutation(api.features.articles.domain.create, {
      knowledgeBaseId: kbId,
      title: 'Shared',
      body: 'Content',
      visibility: 'workspace',
    })
    await team.users.editor.mutation(api.features.articles.domain.publish, { id: articleId })

    const token = await team.users.editor.mutation(api.features.articles.domain.createShareToken, {
      articleId,
      level: 'view',
    })

    // Find the token record and revoke it
    const articles = await team.users.editor.query(api.features.articles.domain.list, {
      knowledgeBaseId: kbId,
    })
    expect(articles).toHaveLength(1)

    // We need to get the token ID — resolve via the hash
    // Instead, we use raw db to find it
    const { hashShareToken: hash } = await import('./features/articles/shareTokens')
    const tokenHash = await hash(token)
    const tokenRecord = (await ctx.readAll('shareTokens')).find(
      (record) => record.hash === tokenHash,
    )

    const revokeArgs = {
      tokenId: tokenRecord!._id,
    }
    const revokePreview = await team.users.editor.mutation(
      api.features.articles.operations.previewRevokeShareToken,
      revokeArgs,
    )

    await team.users.editor.mutation(revokeShareTokenMutation, {
      ...revokeArgs,
      _confirmationToken: revokePreview.confirmation!.token,
    })

    await expect(
      ctx.raw.query(api.features.articles.domain.view, { id: articleId, shareToken: token }),
    ).rejects.toThrow('revoked')
  })

  it('rejects a token used for the wrong article', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { editor: { role: 'editor' } },
    })

    const kbId = await team.users.editor.mutation(api.features.knowledgeBases.domain.create, {
      title: 'Docs',
    })
    await team.users.editor.mutation(api.features.knowledgeBases.domain.publish, { id: kbId })
    const article1 = await team.users.editor.mutation(api.features.articles.domain.create, {
      knowledgeBaseId: kbId,
      title: 'Article 1',
      body: 'One',
      visibility: 'workspace',
    })
    const article2 = await team.users.editor.mutation(api.features.articles.domain.create, {
      knowledgeBaseId: kbId,
      title: 'Article 2',
      body: 'Two',
      visibility: 'workspace',
    })

    const token = await team.users.editor.mutation(api.features.articles.domain.createShareToken, {
      articleId: article1,
      level: 'view',
    })

    await expect(
      ctx.raw.query(api.features.articles.domain.view, { id: article2, shareToken: token }),
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

    const kbId = await team.users.editor.mutation(api.features.knowledgeBases.domain.create, {
      title: 'Docs',
    })
    const articleId = await team.users.editor.mutation(api.features.articles.domain.create, {
      knowledgeBaseId: kbId,
      title: 'Article',
      body: 'Content',
      visibility: 'workspace',
    })

    await expect(
      team.users.viewer.mutation(api.features.articles.domain.createShareToken, {
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

    const kbId = await team.users.owner.mutation(api.features.knowledgeBases.domain.create, {
      title: 'Docs',
    })
    await team.users.owner.mutation(api.features.knowledgeBases.domain.publish, { id: kbId })

    const parentId = await team.users.owner.mutation(api.features.articles.domain.create, {
      knowledgeBaseId: kbId,
      title: 'Parent',
      body: 'Parent content',
      visibility: 'workspace',
    })
    await team.users.owner.mutation(api.features.articles.domain.publish, { id: parentId })

    const childId = await team.users.owner.mutation(api.features.articles.domain.create, {
      knowledgeBaseId: kbId,
      title: 'Child',
      body: 'Child content',
      visibility: 'workspace',
      parentArticleId: parentId,
    })
    await team.users.owner.mutation(api.features.articles.domain.publish, { id: childId })

    // Enroll viewer and grant explicit share on parent
    await team.users.owner.mutation(api.features.knowledgeBases.domain.enroll, {
      knowledgeBaseId: kbId,
      userId: team.users.viewer.id,
    })

    // Add a direct share for the parent article via raw db
    await ctx.seed('articleShares', {
      workspaceId: team.id as never,
      articleId: parentId,
      userId: team.users.viewer.id,
      level: 'comment',
      createdAt: Date.now(),
    })

    // View child — should inherit parent's comment access
    const child = await team.users.viewer.query(api.features.articles.domain.view, { id: childId })
    expect(child._access).toBe('comment')
  })
})

describe('cross-isolation', () => {
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

    await alpha.users.owner.mutation(api.features.knowledgeBases.domain.create, {
      title: 'Alpha Docs',
    })
    await beta.users.owner.mutation(api.features.knowledgeBases.domain.create, {
      title: 'Beta Docs',
    })

    const alphaKBs = await alpha.users.owner.query(api.features.knowledgeBases.domain.list, {})
    const betaKBs = await beta.users.owner.query(api.features.knowledgeBases.domain.list, {})

    expect(alphaKBs).toHaveLength(1)
    expect(alphaKBs[0]?.title).toBe('Alpha Docs')
    expect(betaKBs).toHaveLength(1)
    expect(betaKBs[0]?.title).toBe('Beta Docs')
  })

  it('blocks cross-scope resource access by ID', async () => {
    const ctx = createCtx()
    const alpha = await ctx.seedTenant({
      name: 'Alpha',
      users: { owner: { role: 'owner' } },
    })
    const beta = await ctx.seedTenant({
      name: 'Beta',
      users: { owner: { role: 'owner' } },
    })

    const alphaKB = await alpha.users.owner.mutation(api.features.knowledgeBases.domain.create, {
      title: 'Alpha Docs',
    })

    await expect(
      beta.users.owner.query(api.features.knowledgeBases.domain.get, { id: alphaKB }),
    ).rejects.toThrow('Document belongs to a different isolation scope.')
  })
})

describe('seed and completion flow', () => {
  it('seeds demo articles and allows marking completion', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Acme',
      users: { owner: { role: 'owner' } },
    })

    const kbId = await team.users.owner.mutation(api.features.knowledgeBases.domain.create, {
      title: 'Course',
    })
    await team.users.owner.mutation(api.features.knowledgeBases.domain.publish, { id: kbId })
    const introId = await team.users.owner.mutation(api.features.articles.domain.seed, {
      knowledgeBaseId: kbId,
    })

    const articles = await team.users.owner.query(api.features.articles.domain.list, {
      knowledgeBaseId: kbId,
    })
    expect(articles.length).toBeGreaterThanOrEqual(3)

    await team.users.owner.mutation(api.features.articles.domain.markCompleted, {
      articleId: introId,
    })

    // Marking again should not fail (idempotent)
    const secondId = await team.users.owner.mutation(api.features.articles.domain.markCompleted, {
      articleId: introId,
    })
    expect(secondId).toBeDefined()
  })
})
