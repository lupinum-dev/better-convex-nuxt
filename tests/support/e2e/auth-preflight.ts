import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { parse as parseDotenv } from 'dotenv'

import { fetchWithTimeout, sanitizeBodyPreview } from './http'

interface LocalConvexEnv {
  identityForwardingKey?: string
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
    const localEnvPath = path.join(cwd, '.env.local')
    const localEnvSource = await readFile(localEnvPath, 'utf-8').catch(() => '')
    const values = parseDotenv(localEnvSource)

    return {
      identityForwardingKey: values.CONVEX_IDENTITY_FORWARDING_KEY,
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

function buildLocalAuthSetupHelp(cwd: string): string {
  return [
    '[e2e][local-auth] Local Better Auth setup is incomplete.',
    'Run these commands and retry:',
    `  cd ${cwd}`,
    '  pnpm exec convex dev --local --once',
    '  pnpm exec convex env set SITE_URL http://localhost:3000 --env-file .env.local',
    '  pnpm exec convex env set BETTER_AUTH_SECRET <strong-random-secret> --env-file .env.local',
    `  cd ${process.cwd()} && pnpm test:e2e`,
  ].join('\n')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function assertLocalAuthReady(options: LocalAuthPreflightOptions = {}): Promise<void> {
  const cwd = options.cwd ?? path.resolve(process.cwd(), 'apps/harness')
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
        buildLocalAuthSetupHelp(cwd),
      ].join('\n'),
    )
  }

  const origin = options.origin ?? 'http://localhost:3000'
  const getSessionEndpoint = `${siteUrl.replace(/\/$/, '')}/api/auth/get-session`
  const deadline = Date.now() + timeoutMs

  while (true) {
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
        Math.min(2_000, Math.max(500, deadline - Date.now())),
      )
    } catch (error) {
      if (Date.now() < deadline) {
        await sleep(250)
        continue
      }
      throw new Error(
        [
          `[e2e][local-auth] Could not reach Better Auth endpoint: ${getSessionEndpoint}`,
          `- cause: ${error instanceof Error ? error.message : String(error)}`,
          buildLocalAuthSetupHelp(cwd),
        ].join('\n'),
      )
    }

    if (response.status === 404) {
      if (Date.now() < deadline) {
        await sleep(250)
        continue
      }
      throw new Error(
        [
          `[e2e][local-auth] Better Auth HTTP route returned 404 at ${getSessionEndpoint}.`,
          '- likely cause: Better Auth routes are not registered on the local Convex site URL.',
          buildLocalAuthSetupHelp(cwd),
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
          buildLocalAuthSetupHelp(cwd),
        ].join('\n'),
      )
    }

    if (response.status >= 500) {
      if (Date.now() < deadline) {
        await sleep(250)
        continue
      }
      const body = sanitizeBodyPreview(await response.text())
      throw new Error(
        [
          `[e2e][local-auth] Better Auth endpoint returned ${response.status} at ${getSessionEndpoint}.`,
          `- response: ${body || '(empty body)'}`,
          '- likely cause: missing/invalid BETTER_AUTH_SECRET or local auth component setup.',
          buildLocalAuthSetupHelp(cwd),
        ].join('\n'),
      )
    }

    return
  }
}
