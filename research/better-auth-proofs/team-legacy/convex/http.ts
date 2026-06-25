import { httpRouter } from 'convex/server'

import { components, internal } from './_generated/api'
import { httpAction } from './_generated/server'
import { authComponent, createAuth } from './auth'

const http = httpRouter()

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const token = authorization.slice('Bearer '.length).trim()
  return token.length > 0 ? token : null
}

function hasScope(scopes: unknown, scope: string) {
  return typeof scopes === 'string' && scopes.split(' ').includes(scope)
}

http.route({
  path: '/api/projects',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey) {
      return Response.json({ error: 'Missing x-api-key' }, { status: 401 })
    }

    let body: { organizationId?: unknown; name?: unknown }
    try {
      body = (await request.json()) as { organizationId?: unknown; name?: unknown }
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (typeof body.organizationId !== 'string' || typeof body.name !== 'string') {
      return Response.json({ error: 'organizationId and name are required' }, { status: 400 })
    }

    let organization
    try {
      organization = await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: 'organization',
        where: [{ field: '_id', value: body.organizationId }],
      })
    } catch {
      return Response.json({ error: 'API key organization does not exist' }, { status: 403 })
    }

    if (!organization) {
      return Response.json({ error: 'API key organization does not exist' }, { status: 403 })
    }

    try {
      const result = await ctx.runMutation(internal.apiKeyExperiments.createProjectWithApiKey, {
        key: apiKey,
        organizationId: body.organizationId,
        name: body.name,
      })
      return Response.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'API key project creation failed'
      return Response.json({ error: message }, { status: 403 })
    }
  }),
})

http.route({
  path: '/api/oauth-projects',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const accessToken = bearerToken(request)
    if (!accessToken) {
      return Response.json({ error: 'Missing bearer token' }, { status: 401 })
    }

    let body: { organizationId?: unknown; name?: unknown }
    try {
      body = (await request.json()) as { organizationId?: unknown; name?: unknown }
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (typeof body.organizationId !== 'string' || typeof body.name !== 'string') {
      return Response.json({ error: 'organizationId and name are required' }, { status: 400 })
    }

    const token = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: 'oauthAccessToken',
      where: [{ field: 'accessToken', value: accessToken }],
    })

    if (!token) {
      return Response.json({ error: 'Invalid OAuth access token' }, { status: 401 })
    }
    if (
      typeof token.accessTokenExpiresAt === 'number' &&
      token.accessTokenExpiresAt <= Date.now()
    ) {
      return Response.json({ error: 'Expired OAuth access token' }, { status: 401 })
    }
    if (!hasScope(token.scopes, 'project:create')) {
      return Response.json({ error: 'Missing project:create scope' }, { status: 403 })
    }
    if (typeof token.userId !== 'string' || typeof token.clientId !== 'string') {
      return Response.json(
        { error: 'OAuth access token is missing user or client' },
        { status: 403 },
      )
    }

    const membership = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: 'member',
      where: [
        { field: 'organizationId', value: body.organizationId },
        { field: 'userId', value: token.userId },
      ],
    })

    if (!membership) {
      return Response.json({ error: 'OAuth user is not an organization member' }, { status: 403 })
    }

    try {
      const result = await ctx.runMutation(
        internal.oauthTokenExperiments.createProjectWithOAuthToken,
        {
          tokenId: token._id,
          clientId: token.clientId,
          userId: token.userId,
          organizationId: body.organizationId,
          name: body.name,
        },
      )
      return Response.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OAuth project creation failed'
      return Response.json({ error: message }, { status: 403 })
    }
  }),
})

authComponent.registerRoutesLazy(http, createAuth)

export default http
