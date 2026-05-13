import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { v } from 'convex/values'
import { SignJWT, jwtVerify } from 'jose'

import { internal } from './_generated/api'
/**
 * Experiment 10: Envelope callee-binding roundtrip
 *
 * Validates that envelopes are bound to a specific function and cannot be
 * replayed against a different function, even if signed with the same key.
 *
 * Spec §23.3: verification checks `aud` exact + `callee` exact + `exp`.
 * Spec §26 still uses `fn._name` in pseudo-code; this experiment proves
 * we should use the string form (`"module:exportName"`) as the public
 * contract, since `fn._name` is a Convex internal and not guaranteed stable.
 */
import { internalMutation } from './_generated/server'

const ROOT_SECRET = new TextEncoder().encode('test-deployment-secret-32bytes!!')
const SALT = new TextEncoder().encode('trellis-v1')

function deriveKey(purpose: string): Uint8Array {
  return hkdf(sha256, ROOT_SECRET, SALT, new TextEncoder().encode(purpose), 32)
}

async function signEnvelope(args: {
  purpose: string
  callee: string
  caller: unknown
  ttlSeconds?: number
}): Promise<string> {
  const key = deriveKey(args.purpose)
  return await new SignJWT({
    v: 1,
    aud: args.purpose,
    callee: args.callee,
    caller: args.caller,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${args.ttlSeconds ?? 30}s`)
    .sign(key)
}

async function verifyEnvelope(args: {
  token: string
  expectedPurpose: string
  expectedCallee: string
}): Promise<{ caller: unknown }> {
  const key = deriveKey(args.expectedPurpose)
  const { payload } = await jwtVerify(args.token, key, {
    audience: args.expectedPurpose,
  })
  if (payload.callee !== args.expectedCallee) {
    throw new Error(
      `Callee mismatch: envelope bound to "${String(payload.callee)}", ` +
        `expected "${args.expectedCallee}"`,
    )
  }
  return { caller: payload.caller }
}

/**
 * Derives the public-contract callee string from a Convex function reference.
 * The _generated/api object gives us `internal.module.exportName` function
 * refs. Their canonical string form is "module:exportName".
 *
 * We do NOT rely on `fn._name` (internal, undocumented, version-coupled).
 */
function calleeString(moduleName: string, exportName: string): string {
  return `${moduleName}:${exportName}`
}

// ---- Test 10a: valid envelope verifies cleanly ----

export const testValidEnvelope = internalMutation({
  args: {},
  returns: v.object({
    signed: v.boolean(),
    verified: v.boolean(),
    callee: v.string(),
    caller: v.any(),
  }),
  handler: async () => {
    const callee = calleeString('posts', 'deletePost')
    const token = await signEnvelope({
      purpose: 'trellis:mcp-forwarded:v1',
      callee,
      caller: { kind: 'mcp', mcpKeyId: 'k1', userId: 'u1' },
    })
    const result = await verifyEnvelope({
      token,
      expectedPurpose: 'trellis:mcp-forwarded:v1',
      expectedCallee: callee,
    })
    return {
      signed: token.length > 0,
      verified: true,
      callee,
      caller: result.caller,
    }
  },
})

// ---- Test 10b: envelope bound to A cannot be replayed against B ----

export const testCalleeMismatch = internalMutation({
  args: {},
  returns: v.object({ rejected: v.boolean(), errorMessage: v.string() }),
  handler: async () => {
    const token = await signEnvelope({
      purpose: 'trellis:mcp-forwarded:v1',
      callee: 'posts:deletePost',
      caller: { kind: 'user', userId: 'u1' },
    })
    try {
      await verifyEnvelope({
        token,
        expectedPurpose: 'trellis:mcp-forwarded:v1',
        expectedCallee: 'posts:createPost', // different function
      })
      return { rejected: false, errorMessage: '' }
    } catch (err) {
      return { rejected: true, errorMessage: (err as Error).message }
    }
  },
})

// ---- Test 10c: envelope with wrong purpose fails at audience check ----

export const testPurposeMismatch = internalMutation({
  args: {},
  returns: v.object({ rejected: v.boolean() }),
  handler: async () => {
    const token = await signEnvelope({
      purpose: 'trellis:mcp-forwarded:v1',
      callee: 'posts:deletePost',
      caller: { kind: 'user', userId: 'u1' },
    })
    try {
      // Try to verify as a component-caller envelope instead
      await verifyEnvelope({
        token,
        expectedPurpose: 'trellis:component-caller:v1',
        expectedCallee: 'posts:deletePost',
      })
      return { rejected: false }
    } catch {
      return { rejected: true }
    }
  },
})

// ---- Test 10d: the _generated/api ref carries info we can map to a string ----

export const testApiRefToString: ReturnType<typeof internalMutation> = internalMutation({
  args: {},
  returns: v.object({
    hasRef: v.boolean(),
    refType: v.string(),
  }),
  handler: async (): Promise<{ hasRef: boolean; refType: string }> => {
    // internal.expEnvelopeBinding.testValidEnvelope is a function ref.
    // Convex doesn't give us a stable public accessor for its name at runtime —
    // that's why the spec mandates the string form written explicitly.
    const ref: unknown = internal.expEnvelopeBinding.testValidEnvelope
    return {
      hasRef: ref !== undefined,
      refType: typeof ref,
    }
  },
})
