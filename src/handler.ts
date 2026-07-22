import {
  bearerAuthChallengeResponse,
  createMcpHandler,
  OAuthError,
  OAuthErrorCode,
  verifyBearerToken,
  type AuthInfo,
  type McpRequestContext,
  type McpServer,
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

  return Object.freeze({
    async fetch(context: ActionContext, request: Request): Promise<Response> {
      const authenticated = await authenticateRequest(
        request.headers.get('authorization'),
        options.verifier,
        expectedResource,
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
    return bearerAuthChallengeResponse(error)
  }
  return verified ?? bearerAuthChallengeResponse(new Error('Missing verified access result'))
}
