import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { fetchWithTimeout, sanitizeBodyPreview } from './http'

interface LocalConvexEnv {
  trustedCallerKey?: string
  url?: string
  siteUrl?: string
}

export interface LocalAuthPreflightOptions {
  cwd?: string
  env?: Record<string, string>
  origin?: string
  timeoutMs?: number
}

export async function readLocalConvexEnv(cwd: string): Promise<LocalConvexEnv> {
  try {
    const envPath = path.join(cwd, '.env.local')
    const content = await readFile(envPath, 'utf-8')
    const lines = content.split('\n')

    const values: Record<string, string> = {}
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const [rawKey, ...rest] = trimmed.split('=')
      if (!rawKey || rest.length === 0) continue

      const key = rawKey.trim()
      const rawValue = rest.join('=').trim()
      const value = rawValue.split('#')[0]?.trim()
      if (!value) continue

      values[key] = value
    }

    return {
      trustedCallerKey: values.CONVEX_TRUSTED_CALLER_KEY,
      url: values.CONVEX_URL,
      siteUrl: values.CONVEX_SITE_URL,
    }
  } catch {
    return {}
  }
}

export function deriveSiteUrlFromConvexUrl(urlString: string): string | null {
  try {
    const url = new URL(urlString)
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.port) {
      const port = Number.parseInt(url.port, 10)
      if (!Number.isNaN(port)) {
        url.port = String(port + 1)
        return url.toString().replace(/\/$/, '')
      }
    }
    return null
  } catch {
    return null
  }
}

function buildManagedAuthSetupHelp(cwd: string): string {
  return [
    '[e2e][local-auth] Local Better Auth setup is incomplete.',
    'Run these commands and retry:',
    `  cd ${cwd}`,
    '  npx convex dev --local --once',
    '  npx convex env set SITE_URL http://localhost:3000 --env-file .env.local',
    '  npx convex env set BETTER_AUTH_SECRET <strong-random-secret> --env-file .env.local',
    `  cd ${process.cwd()} && pnpm test:e2e`,
  ].join('\n')
}

export async function assertLocalAuthReady(options: LocalAuthPreflightOptions = {}): Promise<void> {
  const cwd = options.cwd ?? path.resolve(process.cwd(), 'test/internal-harness')
  const timeoutMs = options.timeoutMs ?? 5_000
  const envFile = await readLocalConvexEnv(cwd)
  const mergedEnv = options.env ?? {}

  const convexUrl = mergedEnv.CONVEX_URL ?? process.env.CONVEX_URL ?? envFile.url
  const siteUrl =
    mergedEnv.CONVEX_SITE_URL ??
    process.env.CONVEX_SITE_URL ??
    envFile.siteUrl ??
    (convexUrl ? (deriveSiteUrlFromConvexUrl(convexUrl) ?? undefined) : undefined)

  if (!convexUrl || !siteUrl) {
    const missing = [!convexUrl ? 'CONVEX_URL' : null, !siteUrl ? 'CONVEX_SITE_URL' : null]
      .filter(Boolean)
      .join(', ')

    throw new Error(
      [
        `[e2e][local-auth] Missing required local Convex env values: ${missing}.`,
        `- resolved CONVEX_URL: ${convexUrl ?? 'missing'}`,
        `- resolved CONVEX_SITE_URL: ${siteUrl ?? 'missing'}`,
        buildManagedAuthSetupHelp(cwd),
      ].join('\n'),
    )
  }

  const origin = options.origin ?? 'http://localhost:3000'
  const getSessionEndpoint = `${siteUrl.replace(/\/$/, '')}/api/auth/get-session`

  let response: Response
  try {
    response = await fetchWithTimeout(
      getSessionEndpoint,
      {
        method: 'GET',
        headers: {
          origin,
          'x-forwarded-host': 'localhost:3000',
          'x-forwarded-proto': 'http',
        },
        redirect: 'manual',
      },
      timeoutMs,
    )
  } catch (error) {
    throw new Error(
      [
        `[e2e][local-auth] Could not reach Better Auth endpoint: ${getSessionEndpoint}`,
        `- cause: ${error instanceof Error ? error.message : String(error)}`,
        buildManagedAuthSetupHelp(cwd),
      ].join('\n'),
    )
  }

  if (response.status === 404) {
    throw new Error(
      [
        `[e2e][local-auth] Better Auth HTTP route returned 404 at ${getSessionEndpoint}.`,
        '- likely cause: Better Auth routes are not registered on the local Convex site URL.',
        buildManagedAuthSetupHelp(cwd),
      ].join('\n'),
    )
  }

  if (response.status === 403) {
    const body = sanitizeBodyPreview(await response.text())
    throw new Error(
      [
        `[e2e][local-auth] Better Auth origin validation failed (403) at ${getSessionEndpoint}.`,
        `- attempted origin: ${origin}`,
        `- response: ${body || '(empty body)'}`,
        '- likely cause: SITE_URL/trusted origins do not include http://localhost:3000.',
        buildManagedAuthSetupHelp(cwd),
      ].join('\n'),
    )
  }

  if (response.status >= 500) {
    const body = sanitizeBodyPreview(await response.text())
    throw new Error(
      [
        `[e2e][local-auth] Better Auth endpoint returned ${response.status} at ${getSessionEndpoint}.`,
        `- response: ${body || '(empty body)'}`,
        '- likely cause: missing/invalid BETTER_AUTH_SECRET or local auth component setup.',
        buildManagedAuthSetupHelp(cwd),
      ].join('\n'),
    )
  }
}
