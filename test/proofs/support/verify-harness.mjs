import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'

import { acquireToken, bootPlaygroundServer, reacquireToken } from './acquire-token.mjs'

const PORT = 4649 // harnesses range (4640s), reserved for this bootstrap self-test only
const CONVEX_URL = process.env.CONVEX_URL || 'http://127.0.0.1:3210'

async function main() {
  const server = await bootPlaygroundServer({ port: PORT })
  console.log(`[verify-harness] Nuxt server up at ${server.baseUrl}`)

  try {
    const userA = await acquireToken({
      baseUrl: server.baseUrl,
      email: 'proof-a@example.test',
      password: 'Password123!',
      name: 'Proof A',
    })
    const userB = await acquireToken({
      baseUrl: server.baseUrl,
      email: 'proof-b@example.test',
      password: 'Password123!',
      name: 'Proof B',
    })

    console.log(`[verify-harness] userA.userId=${userA.userId}`)
    console.log(`[verify-harness] userB.userId=${userB.userId}`)

    if (!userA.userId || !userB.userId) throw new Error('Missing userId for A or B')
    if (userA.userId === userB.userId) throw new Error('A and B resolved to the SAME userId')

    const clientA = new ConvexHttpClient(CONVEX_URL)
    clientA.setAuth(userA.token)
    const identityA = await clientA.query(anyApi.proofSupport.identityEcho, {})

    const clientB = new ConvexHttpClient(CONVEX_URL)
    clientB.setAuth(userB.token)
    const identityB = await clientB.query(anyApi.proofSupport.identityEcho, {})

    console.log(`[verify-harness] identityEcho(A).subject=${identityA?.subject}`)
    console.log(`[verify-harness] identityEcho(B).subject=${identityB?.subject}`)

    if (!identityA || !identityB)
      throw new Error('identityEcho returned null for an authenticated client')
    if (identityA.subject === identityB.subject) {
      throw new Error('identityEcho returned the SAME subject for A and B')
    }
    if (identityA.subject !== userA.userId || identityB.subject !== userB.userId) {
      throw new Error('identityEcho subject did not match the decoded JWT sub claim')
    }

    // Token rotation: re-acquire a fresh token for user A and confirm it
    // still resolves to the same identity.
    const userARotated = await reacquireToken({
      baseUrl: server.baseUrl,
      email: 'proof-a@example.test',
      password: 'Password123!',
    })
    if (userARotated.userId !== userA.userId) {
      throw new Error('Rotated token for A resolved to a different userId')
    }
    const clientARotated = new ConvexHttpClient(CONVEX_URL)
    clientARotated.setAuth(userARotated.token)
    const identityARotated = await clientARotated.query(anyApi.proofSupport.identityEcho, {})
    if (identityARotated?.subject !== userA.userId) {
      throw new Error('Rotated token identityEcho subject mismatch')
    }
    const tokensDiffer = userARotated.token !== userA.token
    console.log(`[verify-harness] rotated token for A differs from original: ${tokensDiffer}`)

    console.log('[verify-harness] PASS: distinct non-null subjects for A and B; rotation verified')
  } finally {
    await server.release()
  }
}

main().catch((error) => {
  console.error('[verify-harness] FAIL:', error)
  process.exitCode = 1
})
