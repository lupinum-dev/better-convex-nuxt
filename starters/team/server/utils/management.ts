import {
  appendResponseHeader,
  createError,
  getRequestHeader,
  getRequestURL,
  readBody,
  type H3Event,
} from 'h3'

import { useRuntimeConfig } from '#imports'

type AuthResult = {
  data: unknown
}

function getAuthRoute() {
  const config = useRuntimeConfig()
  const publicConvex = config.public?.convex as { authRoute?: unknown } | undefined
  return typeof publicConvex?.authRoute === 'string' ? publicConvex.authRoute : '/api/auth'
}

function copySetCookie(event: H3Event, response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  const cookies = headers.getSetCookie?.() ?? []
  for (const cookie of cookies) {
    appendResponseHeader(event, 'set-cookie', cookie)
  }
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function getAuthErrorMessage(body: unknown) {
  const record = getRecord(body)
  if (!record) return null

  const error = getRecord(record.error)
  if (typeof error?.message === 'string') return error.message
  return typeof record.message === 'string' ? record.message : null
}

async function parseAuthResponse(event: H3Event, response: Response): Promise<AuthResult> {
  copySetCookie(event, response)

  const body = (await response.json().catch(() => null)) as
    | { data?: unknown; error?: { message?: string }; message?: string; code?: string }
    | unknown
    | null

  if (!response.ok) {
    const message = getAuthErrorMessage(body)
    throw createError({
      statusCode: response.status,
      statusMessage: message || 'Better Auth request failed',
    })
  }

  if (body && typeof body === 'object' && 'error' in body && body.error) {
    throw createError({
      statusCode: 400,
      statusMessage: getAuthErrorMessage(body) || 'Better Auth request failed',
    })
  }

  return {
    data: body && typeof body === 'object' && 'data' in body ? body.data : body,
  }
}

export async function readJsonObject(event: H3Event): Promise<Record<string, unknown>> {
  const body = await readBody(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'JSON object body is required',
    })
  }

  return body as Record<string, unknown>
}

export function readTrimmedString(
  body: Record<string, unknown>,
  field: string,
  message: string,
): string {
  const value = body[field]
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) {
    throw createError({
      statusCode: 400,
      statusMessage: message,
    })
  }

  return trimmed
}

export async function callBetterAuth(event: H3Event, path: string, body: Record<string, unknown>) {
  const requestUrl = getRequestURL(event)
  const authRoute = getAuthRoute()
  const cookie = getRequestHeader(event, 'cookie')
  const origin = getRequestHeader(event, 'origin') ?? requestUrl.origin
  const referer = getRequestHeader(event, 'referer')
  const response = await fetch(`${requestUrl.origin}${authRoute}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      ...(referer ? { referer } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  })

  return await parseAuthResponse(event, response)
}

export async function getBetterAuth(
  event: H3Event,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
) {
  const requestUrl = getRequestURL(event)
  const authRoute = getAuthRoute()
  const cookie = getRequestHeader(event, 'cookie')
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value))
  }
  const suffix = params.size ? `?${params.toString()}` : ''
  const response = await fetch(`${requestUrl.origin}${authRoute}${path}${suffix}`, {
    method: 'GET',
    headers: {
      ...(cookie ? { cookie } : {}),
    },
  })

  return await parseAuthResponse(event, response)
}
