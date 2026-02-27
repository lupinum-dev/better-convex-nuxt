export const MAX_PROXY_REQUEST_BODY_BYTES = 1_048_576 // 1 MiB
export const MAX_PROXY_RESPONSE_BODY_BYTES = 1_048_576 // 1 MiB

interface ProxyBodySizeErrorShape {
  statusCode: 413 | 502
  code: 'BCN_AUTH_PROXY_REQUEST_BODY_TOO_LARGE' | 'BCN_AUTH_PROXY_UPSTREAM_BODY_TOO_LARGE'
  message: string
  contentLengthBytes: number
  maxBytes: number
}

function parseContentLengthBytes(contentLengthHeader: string | null): number | null {
  if (!contentLengthHeader) return null
  const parsed = Number(contentLengthHeader)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.trunc(parsed)
}

export function getRequestBodySizeError(contentLengthHeader: string | null): ProxyBodySizeErrorShape | null {
  const contentLengthBytes = parseContentLengthBytes(contentLengthHeader)
  if (contentLengthBytes === null || contentLengthBytes <= MAX_PROXY_REQUEST_BODY_BYTES) {
    return null
  }
  return {
    statusCode: 413,
    code: 'BCN_AUTH_PROXY_REQUEST_BODY_TOO_LARGE',
    message: `Auth proxy request body too large (${contentLengthBytes} bytes). Maximum allowed is ${MAX_PROXY_REQUEST_BODY_BYTES} bytes.`,
    contentLengthBytes,
    maxBytes: MAX_PROXY_REQUEST_BODY_BYTES,
  }
}

export function getResponseBodySizeError(contentLengthHeader: string | null): ProxyBodySizeErrorShape | null {
  const contentLengthBytes = parseContentLengthBytes(contentLengthHeader)
  if (contentLengthBytes === null || contentLengthBytes <= MAX_PROXY_RESPONSE_BODY_BYTES) {
    return null
  }
  return {
    statusCode: 502,
    code: 'BCN_AUTH_PROXY_UPSTREAM_BODY_TOO_LARGE',
    message: `Auth proxy upstream response body too large (${contentLengthBytes} bytes). Maximum allowed is ${MAX_PROXY_RESPONSE_BODY_BYTES} bytes.`,
    contentLengthBytes,
    maxBytes: MAX_PROXY_RESPONSE_BODY_BYTES,
  }
}
