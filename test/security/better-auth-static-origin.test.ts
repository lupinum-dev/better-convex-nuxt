import { betterAuth } from 'better-auth'
import { describe, expect, it } from 'vitest'

const APPLICATION_ORIGIN = 'https://app.example.test'

const auth = betterAuth({
  baseURL: APPLICATION_ORIGIN,
  secret: '0c58d4c4e2458d1f6a37beab8fe392c91a662f087a331fa628bd466f20e90dc6',
  advanced: { disableCSRFCheck: false, disableOriginCheck: false },
  logger: { disabled: true },
  trustedOrigins: [APPLICATION_ORIGIN],
  socialProviders: {
    apple: {
      clientId: 'test-apple-client',
      clientSecret: 'test-apple-secret',
    },
    github: {
      clientId: 'test-client',
      clientSecret: 'test-secret',
    },
  },
})

function socialSignInRequest(headers: HeadersInit): Request {
  return new Request('https://deployment.convex.site/api/auth/sign-in/social', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...Object.fromEntries(new Headers(headers)),
    },
    body: JSON.stringify({
      provider: 'github',
      callbackURL: '/dashboard',
      disableRedirect: true,
    }),
  })
}

describe('pinned Better Auth static application-origin contract', () => {
  it('generates OAuth callbacks from static baseURL, not request or forwarded hosts', async () => {
    const response = await auth.handler(
      socialSignInRequest({
        origin: APPLICATION_ORIGIN,
        'x-forwarded-host': 'evil.example.test',
        'x-forwarded-proto': 'http',
      }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { url: string }
    const providerUrl = new URL(body.url)
    expect(providerUrl.origin).toBe('https://github.com')
    expect(providerUrl.searchParams.get('redirect_uri')).toBe(
      `${APPLICATION_ORIGIN}/api/auth/callback/github`,
    )
    expect(body.url).not.toContain('evil.example.test')
    expect(body.url).not.toContain('deployment.convex.site')
  })

  it('uses exact trustedOrigins for cookie-bearing POSTs', async () => {
    const hostile = await auth.handler(
      socialSignInRequest({
        cookie: 'better-auth.session_token=opaque',
        origin: 'https://evil.example.test',
        'x-forwarded-host': 'evil.example.test',
        'x-forwarded-proto': 'http',
      }),
    )
    const missing = await auth.handler(
      socialSignInRequest({
        cookie: 'better-auth.session_token=opaque',
      }),
    )

    expect(hostile.status).toBe(403)
    expect(missing.status).toBe(403)
  })

  it('keeps missing-Origin OAuth callback GETs functional and static-origin bound', async () => {
    const response = await auth.handler(
      new Request(
        'https://deployment.convex.site/api/auth/callback/github?code=opaque&state=opaque',
        {
          headers: {
            referer: 'https://github.com/',
            'sec-fetch-site': 'cross-site',
            'x-forwarded-host': 'evil.example.test',
            'x-forwarded-proto': 'http',
          },
        },
      ),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(
      `${APPLICATION_ORIGIN}/api/auth/error?error=state_mismatch`,
    )
  })

  it('accepts Apple-style cross-site form_post and redirects through static baseURL', async () => {
    const response = await auth.handler(
      new Request('https://deployment.convex.site/api/auth/callback/apple', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'https://appleid.apple.com',
          referer: 'https://appleid.apple.com/',
          'sec-fetch-site': 'cross-site',
          'x-forwarded-host': 'evil.example.test',
          'x-forwarded-proto': 'http',
        },
        body: 'code=opaque&state=opaque',
      }),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(
      `${APPLICATION_ORIGIN}/api/auth/callback/apple?code=opaque&state=opaque`,
    )
  })
})
