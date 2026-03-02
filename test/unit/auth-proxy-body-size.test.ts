import { describe, expect, it } from 'vitest'

import {
  getRequestBodySizeError,
  getResponseBodySizeError,
  DEFAULT_MAX_PROXY_REQUEST_BODY_BYTES,
  DEFAULT_MAX_PROXY_RESPONSE_BODY_BYTES,
} from '../../src/runtime/server/api/auth/body-size'

describe('auth proxy body size guards', () => {
  it('ignores missing and malformed content-length headers', () => {
    expect(getRequestBodySizeError(null)).toBeNull()
    expect(getRequestBodySizeError('not-a-number')).toBeNull()
    expect(getResponseBodySizeError(null)).toBeNull()
    expect(getResponseBodySizeError('not-a-number')).toBeNull()
  })

  it('rejects oversized request bodies with 413', () => {
    const error = getRequestBodySizeError(String(DEFAULT_MAX_PROXY_REQUEST_BODY_BYTES + 1))
    expect(error?.statusCode).toBe(413)
    expect(error?.code).toBe('BCN_AUTH_PROXY_REQUEST_BODY_TOO_LARGE')
  })

  it('rejects oversized upstream responses with 502', () => {
    const error = getResponseBodySizeError(String(DEFAULT_MAX_PROXY_RESPONSE_BODY_BYTES + 1))
    expect(error?.statusCode).toBe(502)
    expect(error?.code).toBe('BCN_AUTH_PROXY_UPSTREAM_BODY_TOO_LARGE')
  })

  it('accepts payloads exactly at the configured limits', () => {
    expect(getRequestBodySizeError(String(DEFAULT_MAX_PROXY_REQUEST_BODY_BYTES))).toBeNull()
    expect(getResponseBodySizeError(String(DEFAULT_MAX_PROXY_RESPONSE_BODY_BYTES))).toBeNull()
  })

  it('supports custom configured limits', () => {
    expect(getRequestBodySizeError('11', 10)?.maxBytes).toBe(10)
    expect(getResponseBodySizeError('11', 10)?.maxBytes).toBe(10)
  })
})
