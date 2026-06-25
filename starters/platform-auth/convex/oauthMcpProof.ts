import { v } from 'convex/values'

import { components } from './_generated/api'
import { internalMutation, query } from './_generated/server'

const paginationOpts = { cursor: null, numItems: 10 }
const maxProjectTitleLength = 120

function normalizeProjectTitle(title: string) {
  const normalizedTitle = title.trim()
  if (normalizedTitle.length === 0) {
    throw new Error('Invalid project title')
  }
  if (normalizedTitle.length > maxProjectTitleLength) {
    throw new Error('Invalid project title')
  }
  return normalizedTitle
}

export const createProjectFromVerifiedOAuthClient = internalMutation({
  args: {
    clientId: v.string(),
    audience: v.string(),
    scope: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000'
    if (args.audience !== `${siteUrl}/mcp`) {
      throw new Error('Invalid protected resource audience')
    }

    const scopes = new Set(args.scope.split(' ').filter(Boolean))
    if (!scopes.has('project:create')) {
      throw new Error('Missing project:create scope')
    }

    const clients = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: 'oauthClient',
      paginationOpts,
      where: [{ field: 'clientId', value: args.clientId }],
    })
    const oauthClient = clients.page[0]
    if (!oauthClient) {
      throw new Error('OAuth client not found')
    }
    if (oauthClient.disabled === true) {
      throw new Error('OAuth client is disabled')
    }
    if (!oauthClient.grantTypes?.includes('client_credentials')) {
      throw new Error('OAuth client is not allowed to use client_credentials')
    }
    if (!oauthClient.scopes?.includes('project:create')) {
      throw new Error('OAuth client is not allowed to create projects')
    }

    const title = normalizeProjectTitle(args.title)

    return await ctx.db.insert('oauthProjects', {
      title,
      createdByOAuthClientId: args.clientId,
      createdAt: Date.now(),
    })
  },
})

export const listProjectsForOAuthClient = query({
  args: {
    clientId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('oauthProjects')
      .withIndex('createdByOAuthClientId', (q) =>
        q.eq('createdByOAuthClientId', args.clientId),
      )
      .collect()
  },
})
