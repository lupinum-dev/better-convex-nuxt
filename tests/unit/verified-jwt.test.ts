import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearServerJwksCache, verifyServerJwt } from '../../src/runtime/auth/server/verified-jwt'
import { createServerJwksResponse, mintServerJwt } from '../support/auth/server-jwt'

const siteUrl = 'https://app.example'

async function installStaticJwks() {
  const response = await createServerJwksResponse()
  process.env.JWKS = JSON.stringify(await response.json())
  clearServerJwksCache()
}

async function token(claims: Record<string, unknown>, expiresInSeconds?: number | null) {
  return await mintServerJwt(
    {
      sub: 'user-1',
      email: 'owner@example.com',
      name: 'Owner',
      iss: siteUrl,
      aud: 'convex',
      ...claims,
    },
    { expiresInSeconds },
  )
}

describe('verifyServerJwt', () => {
  const originalJwks = process.env.JWKS

  beforeEach(async () => {
    await installStaticJwks()
  })

  afterEach(() => {
    if (originalJwks === undefined) delete process.env.JWKS
    else process.env.JWKS = originalJwks
    clearServerJwksCache()
  })

  it('accepts a Better Auth Convex JWT with issuer, audience, subject, and expiry', async () => {
    const verified = await verifyServerJwt(await token({}), siteUrl)

    expect(verified.payload).toMatchObject({
      iss: siteUrl,
      aud: 'convex',
      sub: 'user-1',
    })
    expect(verified.user).toMatchObject({
      email: 'owner@example.com',
    })
    expect(verified.user).not.toHaveProperty('id')
  })

  it('rejects wrong issuer and wrong audience tokens', async () => {
    await expect(
      verifyServerJwt(await token({ iss: 'https://other.example' }), siteUrl),
    ).rejects.toThrow(/iss/i)

    await expect(verifyServerJwt(await token({ aud: 'other' }), siteUrl)).rejects.toThrow(/aud/i)
  })

  it('rejects missing subject and missing expiry tokens', async () => {
    await expect(verifyServerJwt(await token({ sub: undefined }), siteUrl)).rejects.toThrow(
      /subject/i,
    )

    await expect(verifyServerJwt(await token({}, null), siteUrl)).rejects.toThrow(/expiration/i)
  })

  it('rejects expired tokens', async () => {
    await expect(verifyServerJwt(await token({}, -60), siteUrl)).rejects.toThrow(/exp/i)
  })
})
