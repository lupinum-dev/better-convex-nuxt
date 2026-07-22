import {
  bearerAuthChallengeResponse,
  buildOAuthProtectedResourceMetadata,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  OAuthError,
  OAuthErrorCode,
  oauthMetadataResponse,
  verifyBearerToken,
  type AuthInfo,
  type AuthMetadataOptions,
  type McpRequestContext,
  type McpServer,
  type OAuthMetadata,
  type OAuthTokenVerifier,
  type Server,
} from '@modelcontextprotocol/server'

import { verifyAndNormalizeMcpAccess } from './access.js'
import type { McpAccessContext, McpAccessVerifier, VerifiedMcpAccess } from './index.js'

export interface ConvexMcpRequestContext {
  readonly era: McpRequestContext['era']
}

export interface ConvexMcpHandlerOptions<ActionContext> {
  readonly resource: URL
  readonly verifier: McpAccessVerifier
  readonly oauthMetadata: OAuthMetadata
  readonly resourceName?: string
  readonly scopesSupported?: readonly string[]
  readonly createServer: (
    context: ActionContext,
    access: McpAccessContext,
    request: ConvexMcpRequestContext,
  ) => McpServer | Server | Promise<McpServer | Server>
}

export interface ConvexMcpHandler<ActionContext> {
  fetch(context: ActionContext, request: Request): Promise<Response>
}

export function createConvexMcpHandler<ActionContext>(
  options: ConvexMcpHandlerOptions<ActionContext>,
): ConvexMcpHandler<ActionContext> {
  const expectedResource = new URL(options.resource.href)
  const metadataOptions: AuthMetadataOptions = {
    oauthMetadata: structuredClone(options.oauthMetadata),
    resourceServerUrl: new URL(expectedResource.href),
    ...(options.resourceName === undefined ? {} : { resourceName: options.resourceName }),
    ...(options.scopesSupported === undefined
      ? {}
      : { scopesSupported: [...options.scopesSupported] }),
  }
  buildOAuthProtectedResourceMetadata(metadataOptions)
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(expectedResource)

  return Object.freeze({
    async fetch(context: ActionContext, request: Request): Promise<Response> {
      const metadataResponse = oauthMetadataResponse(request, metadataOptions)
      if (metadataResponse) return metadataResponse
      const authenticated = await authenticateRequest(
        request.headers.get('authorization'),
        options.verifier,
        expectedResource,
        resourceMetadataUrl,
      )
      if (authenticated instanceof Response) return authenticated

      const handler = createMcpHandler(
        ({ era }) => options.createServer(context, authenticated.access, { era }),
        { legacy: 'stateless' },
      )
      return handler.fetch(request)
    },
  })
}

async function authenticateRequest(
  authorizationHeader: string | null,
  verifier: McpAccessVerifier,
  expectedResource: URL,
  resourceMetadataUrl: string,
): Promise<VerifiedMcpAccess | Response> {
  let verified: VerifiedMcpAccess | undefined
  const officialVerifier: OAuthTokenVerifier = {
    async verifyAccessToken(token): Promise<AuthInfo> {
      try {
        verified = await verifyAndNormalizeMcpAccess({ verifier, token, expectedResource })
      } catch {
        throw new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid access token')
      }
      return {
        token,
        clientId: verified.access.clientId,
        scopes: [...verified.access.scopes],
        expiresAt: verified.expiresAt,
        resource: new URL(verified.access.resource),
      }
    },
  }

  try {
    await verifyBearerToken(authorizationHeader, { verifier: officialVerifier })
  } catch (error) {
    return bearerAuthChallengeResponse(error, { resourceMetadataUrl })
  }
  return (
    verified ??
    bearerAuthChallengeResponse(new Error('Missing verified access result'), {
      resourceMetadataUrl,
    })
  )
}
