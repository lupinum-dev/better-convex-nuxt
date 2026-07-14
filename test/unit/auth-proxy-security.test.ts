import { describe, expect, it } from 'vitest'

import { isCrossOriginAuthRequest, isSameOrigin } from '../../src/runtime/server/api/auth/security'

const INIT_PATH = '/sign-in/social'

describe('auth proxy origin boundary', () => {
  it('accepts only one exact serialized origin', () => {
    expect(isSameOrigin('https://app.example.com', 'https://app.example.com')).toBe(true)
    expect(isSameOrigin('http://app.example.com', 'https://app.example.com')).toBe(false)
    expect(isSameOrigin('https://app.example.com:444', 'https://app.example.com')).toBe(false)
    expect(isSameOrigin('https://app.example.com:443', 'https://app.example.com')).toBe(false)
    expect(isSameOrigin('https://APP.example.com', 'https://app.example.com')).toBe(false)
    expect(isSameOrigin('https://app.example.com.', 'https://app.example.com')).toBe(false)
    expect(isSameOrigin('https://app.example.com/path', 'https://app.example.com')).toBe(false)
    expect(isSameOrigin('not-an-origin', 'https://app.example.com')).toBe(false)
  })

  it('allows headerless server clients and ignores callback Referer metadata on GET', () => {
    expect(
      isCrossOriginAuthRequest(new Headers(), 'POST', 'https://app.example.com', INIT_PATH),
    ).toBe(false)
    expect(
      isCrossOriginAuthRequest(
        new Headers({
          referer: 'https://provider.example/callback',
          'sec-fetch-site': 'cross-site',
        }),
        'GET',
        'https://app.example.com',
        '/callback/github',
      ),
    ).toBe(false)
  })

  it.each(['https://evil.example', 'null', '', 'not-an-origin'])(
    'rejects a present non-matching Origin: %s',
    (origin) => {
      expect(
        isCrossOriginAuthRequest(
          new Headers({ origin }),
          'GET',
          'https://app.example.com',
          INIT_PATH,
        ),
      ).toBe(true)
    },
  )

  it.each(['cross-site', 'same-site', 'same-origin, cross-site', 'CROSS-SITE'])(
    'rejects explicit non-same-origin POST Fetch Metadata: %s',
    (site) => {
      expect(
        isCrossOriginAuthRequest(
          new Headers({ origin: 'https://app.example.com', 'sec-fetch-site': site }),
          'POST',
          'https://app.example.com',
          INIT_PATH,
        ),
      ).toBe(true)
    },
  )

  it('uses Referer only as a POST fallback when Origin is absent', () => {
    expect(
      isCrossOriginAuthRequest(
        new Headers({
          origin: 'https://app.example.com',
          referer: 'https://evil.example/path',
        }),
        'POST',
        'https://app.example.com',
        INIT_PATH,
      ),
    ).toBe(false)
    expect(
      isCrossOriginAuthRequest(
        new Headers({ referer: 'https://app.example.com:443/path?query=1' }),
        'POST',
        'https://app.example.com',
        INIT_PATH,
      ),
    ).toBe(false)
    expect(
      isCrossOriginAuthRequest(
        new Headers({ referer: 'https://evil.example/path' }),
        'POST',
        'https://app.example.com',
        INIT_PATH,
      ),
    ).toBe(true)
    expect(
      isCrossOriginAuthRequest(
        new Headers({ referer: 'https://user@app.example.com/path' }),
        'POST',
        'https://app.example.com',
        INIT_PATH,
      ),
    ).toBe(true)
    expect(
      isCrossOriginAuthRequest(
        new Headers({ referer: 'not-a-url' }),
        'POST',
        'https://app.example.com',
        INIT_PATH,
      ),
    ).toBe(true)
  })

  it('exempts only one well-formed core OAuth POST callback segment', () => {
    const providerPost = new Headers({
      origin: 'https://appleid.apple.com',
      referer: 'https://appleid.apple.com/',
      'sec-fetch-site': 'cross-site',
    })
    expect(
      isCrossOriginAuthRequest(providerPost, 'POST', 'https://app.example.com', '/callback/apple'),
    ).toBe(false)

    for (const path of [
      '/callback/',
      '/callback/apple/extra',
      '/callback/%2Fupstream-owned',
      '/callback/%5Cupstream-owned',
      '/callback/%2e%2e',
      '/callback/%00apple',
      '/callback/%',
      '/oauth2/callback/apple',
      '/plugin/callback/apple',
    ]) {
      expect(
        isCrossOriginAuthRequest(providerPost, 'POST', 'https://app.example.com', path),
        path,
      ).toBe(true)
    }
    expect(
      isCrossOriginAuthRequest(providerPost, 'GET', 'https://app.example.com', '/callback/apple'),
    ).toBe(true)
  })
})
