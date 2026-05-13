import { exportJWK, generateKeyPair, SignJWT } from 'jose'

type JwtPayload = Record<string, unknown>

type ServerJwtMaterial = {
  publicJwks: { keys: Record<string, unknown>[] }
  privateKey: CryptoKey
}

let serverJwtMaterialPromise: Promise<ServerJwtMaterial> | null = null

async function getServerJwtMaterial(): Promise<ServerJwtMaterial> {
  if (!serverJwtMaterialPromise) {
    serverJwtMaterialPromise = (async () => {
      const { privateKey, publicKey } = await generateKeyPair('RS256')
      const jwk = await exportJWK(publicKey)
      return {
        publicJwks: {
          keys: [{ ...jwk, alg: 'RS256', kid: 'trellis-test-key', use: 'sig' }],
        },
        privateKey,
      }
    })()
  }

  return await serverJwtMaterialPromise
}

export async function mintServerJwt(
  payload: JwtPayload,
  options: { audience?: string; expiresInSeconds?: number | null; issuer?: string } = {},
): Promise<string> {
  const { privateKey } = await getServerJwtMaterial()
  const now = Math.floor(Date.now() / 1000)
  const hasIssuerClaim = Object.prototype.hasOwnProperty.call(payload, 'iss')
  const hasAudienceClaim = Object.prototype.hasOwnProperty.call(payload, 'aud')

  let jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'trellis-test-key', typ: 'JWT' })
    .setIssuedAt(now)
  if (options.issuer !== undefined || !hasIssuerClaim) {
    jwt = jwt.setIssuer(options.issuer ?? 'http://127.0.0.1:3211')
  }
  if (options.audience !== undefined || !hasAudienceClaim) {
    jwt = jwt.setAudience(options.audience ?? 'convex')
  }
  if (options.expiresInSeconds !== null) {
    jwt = jwt.setExpirationTime(now + (options.expiresInSeconds ?? 3600))
  }
  return await jwt.sign(privateKey)
}

export async function createServerJwksResponse(): Promise<Response> {
  const { publicJwks } = await getServerJwtMaterial()
  return new Response(JSON.stringify(publicJwks), {
    headers: { 'content-type': 'application/json' },
  })
}
