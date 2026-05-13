import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { v } from 'convex/values'
import { SignJWT, jwtVerify } from 'jose'

import { internal } from './_generated/api'
/**
 * Experiment 14: ctx.runAsUser() roundtrip
 *
 * Spec update: symmetric to ctx.runAsService but forwards the CURRENT
 * user caller into an internal mutation. Used when an action (or
 * scheduler callback) needs to invoke an internal function and preserve
 * the user's identity — without relying on implicit propagation.
 *
 * Envelope purpose: 'trellis:identity-forwarding:v1' (same key as service).
 * Only the caller payload shape differs: { kind: 'user', userId }.
 *
 * Cases:
 *   14a  happy path: signed user envelope → resolver populates ctx.caller
 *        as { kind: 'user', userId }.
 *   14b  tampered envelope fails verification.
 *   14c  envelope bound to function X cannot call function Y.
 *   14d  no envelope on an internal mutation → systemCaller fallback
 *        (not the caller's user identity; explicit call required).
 *   14e  a service envelope cannot be replayed as a user envelope
 *        (the caller shape is checked after verification).
 */
import { action, internalMutation } from './_generated/server'

const ROOT_SECRET = new TextEncoder().encode('test-deployment-secret-32bytes!!')
const SALT = new TextEncoder().encode('trellis-v1')
const PURPOSE = 'trellis:identity-forwarding:v1'

function deriveKey(): Uint8Array {
  return hkdf(sha256, ROOT_SECRET, SALT, new TextEncoder().encode(PURPOSE), 32)
}

async function signUserEnvelope(callee: string, userId: string): Promise<string> {
  return await new SignJWT({
    v: 1,
    aud: PURPOSE,
    callee,
    caller: { kind: 'user', userId },
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30s')
    .sign(deriveKey())
}

async function signServiceEnvelope(callee: string, service: string): Promise<string> {
  return await new SignJWT({
    v: 1,
    aud: PURPOSE,
    callee,
    caller: { kind: 'service', service },
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30s')
    .sign(deriveKey())
}

type Caller =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string }
  | { kind: 'service'; service: string }

/**
 * The internal resolver. In production this lives inside defineFunctions
 * and runs on every internal mutation call. It consumes __principal
 * before user code sees it.
 */
async function resolveWithEnvelope(
  envelope: string | undefined,
  expectedCallee: string,
): Promise<Caller> {
  if (!envelope) {
    // Non-request context default.
    return { kind: 'service', service: 'system' }
  }
  const { payload } = await jwtVerify(envelope, deriveKey(), { audience: PURPOSE })
  if (payload.callee !== expectedCallee) {
    throw new Error(
      `Callee mismatch: envelope bound to "${String(payload.callee)}", ` +
        `expected "${expectedCallee}"`,
    )
  }
  return payload.caller as Caller
}

/**
 * The internal mutation under test. Uses the user caller to write
 * audit metadata, then returns what it resolved to.
 */
export const generateReport = internalMutation({
  args: {
    reportId: v.string(),
    __principal: v.optional(v.string()),
  },
  returns: v.object({
    principalKind: v.string(),
    userId: v.optional(v.string()),
    service: v.optional(v.string()),
    auditedId: v.string(),
  }),
  handler: async (ctx, args) => {
    const caller = await resolveWithEnvelope(args.__principal, 'expRunAsUser:generateReport')

    const callerKey =
      caller.kind === 'user'
        ? `user:${caller.userId}`
        : caller.kind === 'service'
          ? `service:${caller.service}`
          : 'anonymous'

    const id = await ctx.db.insert('expAuditLog', {
      operation: 'generateReport',
      callerKey,
      argsHash: args.reportId.slice(0, 40),
      timestamp: Date.now(),
    })

    return {
      principalKind: caller.kind,
      userId: caller.kind === 'user' ? caller.userId : undefined,
      service: caller.kind === 'service' ? caller.service : undefined,
      auditedId: id,
    }
  },
})

// ---- 14a: happy path ----

export const testHappyPath = action({
  args: { userId: v.string() },
  returns: v.object({
    principalKind: v.string(),
    userId: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{ principalKind: string; userId: string | undefined }> => {
    const envelope = await signUserEnvelope('expRunAsUser:generateReport', args.userId)
    const result = await ctx.runMutation(internal.expRunAsUser.generateReport, {
      reportId: 'report-123',
      __principal: envelope,
    })
    return { principalKind: result.principalKind, userId: result.userId }
  },
})

// ---- 14b: tampered envelope ----

export const testTamperedEnvelope = action({
  args: {},
  returns: v.object({ rejected: v.boolean() }),
  handler: async (ctx): Promise<{ rejected: boolean }> => {
    const envelope = await signUserEnvelope('expRunAsUser:generateReport', 'user-abc')
    const tampered = envelope.slice(0, -3) + 'AAA'
    try {
      await ctx.runMutation(internal.expRunAsUser.generateReport, {
        reportId: 'report-bad',
        __principal: tampered,
      })
      return { rejected: false }
    } catch {
      return { rejected: true }
    }
  },
})

// ---- 14c: callee mismatch ----

export const testWrongCallee = action({
  args: {},
  returns: v.object({ rejected: v.boolean(), error: v.string() }),
  handler: async (ctx): Promise<{ rejected: boolean; error: string }> => {
    const envelope = await signUserEnvelope('expRunAsUser:somethingElse', 'user-abc')
    try {
      await ctx.runMutation(internal.expRunAsUser.generateReport, {
        reportId: 'report-bad',
        __principal: envelope,
      })
      return { rejected: false, error: '' }
    } catch (err) {
      return { rejected: true, error: (err as Error).message }
    }
  },
})

// ---- 14d: no envelope → system fallback ----

export const testNoEnvelope = action({
  args: {},
  returns: v.object({ principalKind: v.string(), service: v.optional(v.string()) }),
  handler: async (ctx): Promise<{ principalKind: string; service: string | undefined }> => {
    const result = await ctx.runMutation(internal.expRunAsUser.generateReport, {
      reportId: 'system-report',
      // no __principal — action didn't call runAsUser
    })
    return { principalKind: result.principalKind, service: result.service }
  },
})

// ---- 14e: service envelope does NOT become a user ----

export const testServiceIsNotUser = action({
  args: {},
  returns: v.object({
    principalKind: v.string(),
    service: v.optional(v.string()),
    userId: v.optional(v.string()),
  }),
  handler: async (
    ctx,
  ): Promise<{
    principalKind: string
    service: string | undefined
    userId: string | undefined
  }> => {
    // A service-shaped envelope verified against the same purpose key.
    // Our resolver returns the caller as-is — the user-assertion
    // happens at the handler / appIdentity-resolver layer, not the envelope
    // layer. This test confirms we don't silently coerce kinds.
    const envelope = await signServiceEnvelope('expRunAsUser:generateReport', 'cron')
    const result = await ctx.runMutation(internal.expRunAsUser.generateReport, {
      reportId: 'cron-report',
      __principal: envelope,
    })
    return {
      principalKind: result.principalKind,
      service: result.service,
      userId: result.userId,
    }
  },
})
