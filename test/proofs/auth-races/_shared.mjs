/**
 * Shared setup for the AUTH RACES proof group (vNext §5.8 proofs 6, 8, 9, 10
 * + internal §20 total-token-fetcher / transient-retry / concurrent-session).
 *
 * Boots the playground server ONCE (port 4620), acquires real Better Auth
 * Convex JWTs for users A and B plus a rotated fresh-A token, and exposes the
 * live local Convex deployment URL and proof-support function references.
 *
 * These are PRE-IMPLEMENTATION proofs: the serial identity queue, authEpoch,
 * retirement wrapper and total token fetcher are PROTOTYPES built here to prove
 * the dependency/system mechanics the vNext design rests on. They do not import
 * or refactor library source.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { anyApi } from 'convex/server'

import { bootPlaygroundServer, acquireToken, reacquireToken } from '../support/acquire-token.mjs'

const PORT = 4620

const playgroundCwd = fileURLToPath(new URL('../../../playground/', import.meta.url))

export function resolveConvexUrl() {
  if (process.env.CONVEX_URL) return process.env.CONVEX_URL
  try {
    const content = readFileSync(path.join(playgroundCwd, '.env.local'), 'utf-8')
    for (const line of content.split('\n')) {
      const m = line.trim().match(/^CONVEX_URL=(.+)$/)
      if (m) return m[1].trim().split('#')[0].trim()
    }
  } catch {
    // fall through to default deployment URL
  }
  return 'http://127.0.0.1:3210'
}

export const api = {
  identityEcho: anyApi.proofSupport.identityEcho,
  failingQuery: anyApi.proofSupport.failingQuery,
  incrementCounter: anyApi.proofSupport.incrementCounter,
  getCounter: anyApi.proofSupport.getCounter,
}

export const CREDS = {
  A: { email: 'proof-a@example.test', password: 'Password123!', name: 'Proof A' },
  B: { email: 'proof-b@example.test', password: 'Password123!', name: 'Proof B' },
}

/**
 * Boot the server and acquire the tokens all proofs need.
 * Returns { convexUrl, api, tokens: { A, B, Afresh }, release }.
 */
export async function setup() {
  const convexUrl = resolveConvexUrl()
  const server = await bootPlaygroundServer({ port: PORT })
  const A = await acquireToken({ baseUrl: server.baseUrl, ...CREDS.A })
  const B = await acquireToken({ baseUrl: server.baseUrl, ...CREDS.B })
  // Fresh sign-in for A → new session cookie → distinct JWT string, same subject.
  const Afresh = await reacquireToken({
    baseUrl: server.baseUrl,
    email: CREDS.A.email,
    password: CREDS.A.password,
  })
  return {
    convexUrl,
    api,
    tokens: { A, B, Afresh },
    release: () => server.release(),
  }
}

export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
