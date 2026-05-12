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
  options: { expiresInSeconds?: number | null } = {},
): Promise<string> {
  const { privateKey } = await getServerJwtMaterial()
  const now = Math.floor(Date.now() / 1000)

  let jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'trellis-test-key', typ: 'JWT' })
    .setIssuedAt(now)
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
