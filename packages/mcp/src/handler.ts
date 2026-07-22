import {
  bearerAuthChallengeResponse,
  buildOAuthProtectedResourceMetadata,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  OAuthError,
  OAuthErrorCode,
  oauthMetadataResponse,
  originValidationResponse,
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
import {
  boundMcpResponse,
  McpTransportFailure,
  mcpTransportFailureResponse,
  prepareBoundedMcpRequest,
  runMcpRequestDeadline,
} from './transport.js'

export interface ConvexMcpRequestContext {
  readonly era: McpRequestContext['era']
}

export interface ConvexMcpHandlerOptions<ActionContext> {
  readonly resource: URL
  readonly verifier: McpAccessVerifier
  readonly oauthMetadata: OAuthMetadata
  readonly resourceName?: string
  readonly requiredScopes?: readonly string[]
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
  const requiredScopes =
    options.requiredScopes === undefined ? undefined : [...options.requiredScopes]

  return Object.freeze({
    async fetch(context: ActionContext, request: Request): Promise<Response> {
      try {
        return await runMcpRequestDeadline(request.signal, async (signal) => {
          const metadataResponse = oauthMetadataResponse(request, metadataOptions)
          if (metadataResponse) return await boundMcpResponse(metadataResponse)
          const boundaryResponse = requestBoundaryResponse(request, expectedResource)
          if (boundaryResponse) return boundaryResponse
          const authenticated = await authenticateRequest(
            request.headers.get('authorization'),
            options.verifier,
            metadataOptions.oauthMetadata.issuer,
            expectedResource,
            resourceMetadataUrl,
            requiredScopes,
          )
          if (authenticated instanceof Response) return await boundMcpResponse(authenticated)

          const boundedRequest = await prepareBoundedMcpRequest(request, signal)
          const handler = createMcpHandler(
            ({ era }) => options.createServer(context, authenticated.access, { era }),
            { legacy: 'stateless' },
          )
          try {
            return await boundMcpResponse(await handler.fetch(boundedRequest))
          } finally {
            await handler.close()
          }
        })
      } catch (error) {
        if (error instanceof McpTransportFailure) return mcpTransportFailureResponse(error)
        throw error
      }
    },
  })
}

function requestBoundaryResponse(request: Request, expectedResource: URL): Response | undefined {
  const url = new URL(request.url)
  if (url.href !== expectedResource.href) return emptyFailure(404)
  if (request.headers.has('content-encoding')) return emptyFailure(415)
  const originRejected = originValidationResponse(request, [])
  return originRejected ? emptyFailure(originRejected.status) : undefined
}

function emptyFailure(status: number): Response {
  return new Response(null, {
    headers: { 'cache-control': 'no-store' },
    status,
  })
}

async function authenticateRequest(
  authorizationHeader: string | null,
  verifier: McpAccessVerifier,
  expectedIssuer: string,
  expectedResource: URL,
  resourceMetadataUrl: string,
  requiredScopes: string[] | undefined,
): Promise<VerifiedMcpAccess | Response> {
  let verified: VerifiedMcpAccess | undefined
  const officialVerifier: OAuthTokenVerifier = {
    async verifyAccessToken(token): Promise<AuthInfo> {
      try {
        verified = await verifyAndNormalizeMcpAccess({
          verifier,
          token,
          expectedIssuer,
          expectedResource,
        })
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
    await verifyBearerToken(authorizationHeader, {
      verifier: officialVerifier,
      requiredScopes,
    })
  } catch (error) {
    return bearerAuthChallengeResponse(error, { resourceMetadataUrl, requiredScopes })
  }
  return (
    verified ??
    bearerAuthChallengeResponse(new Error('Missing verified access result'), {
      resourceMetadataUrl,
    })
  )
}
