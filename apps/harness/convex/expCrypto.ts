import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { v } from 'convex/values'
import { SignJWT, jwtVerify } from 'jose'

/**
 * Experiment 1: Crypto in Convex Runtime
 *
 * Validates that HKDF key derivation + JWT sign/verify works
 * inside a Convex mutation (V8 runtime, no "use node").
 */
import { mutation, query } from './_generated/server'

// Test 1a: HKDF key derivation with @noble/hashes
export const testHkdf = mutation({
  args: {},
  returns: v.object({
    success: v.boolean(),
    keyLength: v.number(),
    keyHex: v.string(),
  }),
  handler: async (_ctx) => {
    const rootSecret = new TextEncoder().encode('test-deployment-secret-32bytes!!')
    const salt = new TextEncoder().encode('trellis-v1')
    const info = new TextEncoder().encode('trellis:component-caller:v1')

    const derivedKey = hkdf(sha256, rootSecret, salt, info, 32)

    return {
      success: derivedKey.length === 32,
      keyLength: derivedKey.length,
      keyHex: Array.from(derivedKey)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(''),
    }
  },
})

// Test 1b: JWT sign + verify with jose (uses crypto.subtle)
export const testJoseJwt = mutation({
  args: {},
  returns: v.object({
    success: v.boolean(),
    tokenLength: v.number(),
    audience: v.string(),
    callee: v.string(),
  }),
  handler: async (_ctx) => {
    // Using top-level static imports (SignJWT, jwtVerify)

    // Create a raw secret key for HS256
    const secret = new TextEncoder().encode('test-secret-key-at-least-32-bytes!!')

    // Sign
    const token = await new SignJWT({
      aud: 'trellis:test:v1',
      callee: 'posts:deletePost',
      v: 1,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret)

    // Verify
    const { payload } = await jwtVerify(token, secret, {
      audience: 'trellis:test:v1',
    })

    return {
      success: true,
      tokenLength: token.length,
      audience: payload.aud as string,
      callee: payload.callee as string,
    }
  },
})

// Test 1c: Full pipeline — HKDF derive key → sign JWT → verify JWT
export const testFullPipeline = mutation({
  args: {},
  returns: v.object({
    success: v.boolean(),
    tokenLength: v.number(),
    claims: v.object({
      aud: v.string(),
      callee: v.string(),
      v: v.number(),
      argsHash: v.string(),
      previewHash: v.string(),
    }),
  }),
  handler: async (_ctx) => {
    // Using top-level static imports (hkdf, sha256)
    // Using top-level static imports (SignJWT, jwtVerify)

    // Step 1: Derive purpose-specific key
    const rootSecret = new TextEncoder().encode('test-deployment-secret-32bytes!!')
    const salt = new TextEncoder().encode('trellis-v1')
    const info = new TextEncoder().encode('trellis:mcp-confirmation:v1')
    const derivedKey = hkdf(sha256, rootSecret, salt, info, 32)

    // Step 2: Sign JWT with derived key
    const token = await new SignJWT({
      aud: 'trellis:mcp-confirmation:v1',
      callee: 'runbooks:executeDeleteRunbook',
      v: 1,
      argsHash: 'abc123',
      previewHash: 'def456',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .setJti('unique-jti-001')
      .sign(derivedKey)

    // Step 3: Verify JWT with same derived key
    const { payload } = await jwtVerify(token, derivedKey, {
      audience: 'trellis:mcp-confirmation:v1',
    })

    return {
      success: true,
      tokenLength: token.length,
      claims: {
        aud: payload.aud as string,
        callee: payload.callee as string,
        v: payload.v as number,
        argsHash: payload.argsHash as string,
        previewHash: payload.previewHash as string,
      },
    }
  },
})

// Test 1d: Verify that wrong key / wrong audience fails
export const testVerificationFailures = mutation({
  args: {},
  returns: v.object({
    wrongKeyFails: v.boolean(),
    wrongAudienceFails: v.boolean(),
    expiredFails: v.boolean(),
  }),
  handler: async (_ctx) => {
    // Using top-level static imports (hkdf, sha256)
    // Using top-level static imports (SignJWT, jwtVerify)

    const rootSecret = new TextEncoder().encode('test-deployment-secret-32bytes!!')
    const salt = new TextEncoder().encode('trellis-v1')

    // Derive two different keys for two purposes
    const key1 = hkdf(sha256, rootSecret, salt, new TextEncoder().encode('purpose-1'), 32)
    const key2 = hkdf(sha256, rootSecret, salt, new TextEncoder().encode('purpose-2'), 32)

    // Sign with key1
    const token = await new SignJWT({ aud: 'purpose-1', v: 1 })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key1)

    // Wrong key should fail
    let wrongKeyFails = false
    try {
      await jwtVerify(token, key2)
    } catch {
      wrongKeyFails = true
    }

    // Wrong audience should fail
    let wrongAudienceFails = false
    try {
      await jwtVerify(token, key1, { audience: 'wrong-audience' })
    } catch {
      wrongAudienceFails = true
    }

    // Expired token should fail
    const expiredToken = await new SignJWT({ aud: 'purpose-1', v: 1 })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 600) // 10 min ago
      .setExpirationTime(Math.floor(Date.now() / 1000) - 300) // expired 5 min ago
      .sign(key1)

    let expiredFails = false
    try {
      await jwtVerify(expiredToken, key1)
    } catch {
      expiredFails = true
    }

    return { wrongKeyFails, wrongAudienceFails, expiredFails }
  },
})
