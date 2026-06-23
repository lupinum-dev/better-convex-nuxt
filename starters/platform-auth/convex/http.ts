import { mcpHandler } from '@better-auth/oauth-provider'
import { oauthProviderResourceClient } from '@better-auth/oauth-provider/resource-client'
import { httpRouter } from 'convex/server'

import { internal } from './_generated/api'
import { httpAction } from './_generated/server'
import { authComponent, createAuth } from './auth'

const http = httpRouter()

http.route({
  path: '/api/auth/jwks',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url)
    url.pathname = '/api/auth/convex/jwks'

    return createAuth(ctx).handler(new Request(url, request))
  }),
})

http.route({
  path: '/.well-known/oauth-protected-resource/mcp',
  method: 'GET',
  handler: httpAction(async () => {
    const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000'
    const plugin = oauthProviderResourceClient()
    const metadata = await plugin.getActions().getProtectedResourceMetadata(
      {
        resource: `${siteUrl}/mcp`,
        authorization_servers: [`${siteUrl}/api/auth`],
        scopes_supported: ['project:create'],
      },
      { externalScopes: ['project:create'] },
    )

    return Response.json(metadata)
  }),
})

http.route({
  path: '/mcp',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000'
    const requestUrl = new URL(request.url)
    const handler = mcpHandler(
      {
        jwksUrl: `${requestUrl.origin}/api/auth/jwks`,
        verifyOptions: {
          audience: `${siteUrl}/mcp`,
          issuer: `${siteUrl}/api/auth`,
        },
        scopes: ['project:create'],
      },
      async (mcpRequest, jwt) => {
        const body = await mcpRequest.json()
        if (body.method !== 'tools/call' || body.params?.name !== 'projects.create') {
          return Response.json(
            {
              jsonrpc: '2.0',
              id: body.id ?? null,
              error: { code: -32601, message: 'Unknown tool' },
            },
            { status: 404 },
          )
        }

        if (typeof jwt.azp !== 'string') {
          throw new TypeError('Missing OAuth client id')
        }
        const title = body.params?.arguments?.title
        if (typeof title !== 'string' || title.trim() === '') {
          return Response.json(
            {
              jsonrpc: '2.0',
              id: body.id ?? null,
              error: { code: -32602, message: 'Missing title' },
            },
            { status: 400 },
          )
        }

        let projectId
        try {
          projectId = await ctx.runMutation(
            internal.oauthMcpProof.createProjectFromVerifiedOAuthClient,
            {
              clientId: jwt.azp,
              audience: String(jwt.aud),
              scope: String(jwt.scope ?? ''),
              title,
            },
          )
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : ''
          const productAuthMessage = [
            'Invalid protected resource audience',
            'Missing project:create scope',
            'OAuth client not found',
            'OAuth client is disabled',
            'OAuth client is not allowed to use client_credentials',
            'OAuth client is not allowed to create projects',
            'Invalid project title',
          ].find((message) => errorMessage.includes(message))

          const status = productAuthMessage === 'Invalid project title' ? 400 : 403
          const code = productAuthMessage === 'Invalid project title' ? -32602 : -32001

          return Response.json(
            {
              jsonrpc: '2.0',
              id: body.id ?? null,
              error: {
                code,
                message: productAuthMessage ?? 'Product authorization failed',
              },
            },
            { status },
          )
        }

        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  projectId,
                  createdByOAuthClientId: jwt.azp,
                }),
              },
            ],
          },
        })
      },
      { resourceMetadataMappings: {} },
    )

    return await handler(request)
  }),
})

authComponent.registerRoutesLazy(http, createAuth)

export default http
