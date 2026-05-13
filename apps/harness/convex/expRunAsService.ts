import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { v } from 'convex/values'
import { SignJWT, jwtVerify } from 'jose'

import { internal } from './_generated/api'
/**
 * Experiment 11: ctx.runAsService() roundtrip
 *
 * Spec §10.3, §26: HTTP actions verify a webhook, then invoke an
 * internalMutation with a signed identity-forwarding envelope. The internal
 * mutation's caller resolver recognizes the envelope, verifies it,
 * and populates ctx.caller with the service caller.
 *
 * This experiment simulates the full chain in one mutation because
 * convex-test doesn't run real httpActions — the key thing to prove
 * is that the envelope + verifier + resolver compose correctly.
 *
 * Cases covered:
 *   11a  happy path: signed service envelope → resolver populates ctx.caller
 *   11b  tampered envelope fails verification
 *   11c  envelope bound to function X cannot call function Y
 *   11d  anonymous call with no envelope falls back to systemCaller default
 */
import { action, internalMutation } from './_generated/server'

const ROOT_SECRET = new TextEncoder().encode('test-deployment-secret-32bytes!!')
const SALT = new TextEncoder().encode('trellis-v1')
const PURPOSE = 'trellis:identity-forwarding:v1'

function deriveKey(): Uint8Array {
  return hkdf(sha256, ROOT_SECRET, SALT, new TextEncoder().encode(PURPOSE), 32)
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

// ---- The shared "resolver" that internal mutations would use ----
//
// Real trellis: this lives in defineFunctions for internalQuery / internalMutation.
// It consumes the __principal arg before user code sees it.

type Caller =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string }
  | { kind: 'service'; service: string }

async function resolveCallerWithEnvelope(
  envelope: string | undefined,
  expectedCallee: string,
): Promise<Caller> {
  if (!envelope) {
    // Non-request context default — the spec's systemCaller fallback.
    return { kind: 'service', service: 'system' }
  }
  const { payload } = await jwtVerify(envelope, deriveKey(), {
    audience: PURPOSE,
  })
  if (payload.callee !== expectedCallee) {
    throw new Error(
      `Callee mismatch: envelope bound to "${String(payload.callee)}", ` +
        `expected "${expectedCallee}"`,
    )
  }
  return payload.caller as Caller
}

// ---- The "recordPayment" internal mutation from spec §10.3 ----

export const recordPayment = internalMutation({
  args: { event: v.any(), __principal: v.optional(v.string()) },
  returns: v.object({
    principalKind: v.string(),
    service: v.optional(v.string()),
    auditedId: v.string(),
  }),
  handler: async (ctx, args) => {
    // This is what defineFunctions would do in the 'input' step:
    const caller = await resolveCallerWithEnvelope(
      args.__principal,
      // The spec's callee form: "module:exportName"
      'expRunAsService:recordPayment',
    )

    const id = await ctx.db.insert('expAuditLog', {
      operation: 'recordPayment',
      callerKey: caller.kind === 'service' ? `service:${caller.service}` : caller.kind,
      argsHash: JSON.stringify(args.event).slice(0, 40),
      timestamp: Date.now(),
    })

    return {
      principalKind: caller.kind,
      service: caller.kind === 'service' ? caller.service : undefined,
      auditedId: id,
    }
  },
})

// ---- Test 11a: happy path ----

export const testHappyPath = action({
  args: {},
  returns: v.object({
    principalKind: v.string(),
    service: v.optional(v.string()),
    envelopeLength: v.number(),
  }),
  handler: async (
    ctx,
  ): Promise<{ principalKind: string; service: string | undefined; envelopeLength: number }> => {
    // What ctx.runAsService would do internally:
    const envelope = await signServiceEnvelope('expRunAsService:recordPayment', 'stripe-webhook')

    const result = await ctx.runMutation(internal.expRunAsService.recordPayment, {
      event: { type: 'invoice.paid', amount: 1000 },
      __principal: envelope,
    })

    return {
      principalKind: result.principalKind,
      service: result.service,
      envelopeLength: envelope.length,
    }
  },
})

// ---- Test 11b: tampered envelope fails ----

export const testTamperedEnvelope = action({
  args: {},
  returns: v.object({ rejected: v.boolean(), error: v.string() }),
  handler: async (ctx): Promise<{ rejected: boolean; error: string }> => {
    const envelope = await signServiceEnvelope('expRunAsService:recordPayment', 'stripe-webhook')
    // Tamper: flip one char in the signature portion.
    const tampered = envelope.slice(0, -3) + 'AAA'

    try {
      await ctx.runMutation(internal.expRunAsService.recordPayment, {
        event: { type: 'invoice.paid' },
        __principal: tampered,
      })
      return { rejected: false, error: '' }
    } catch (err) {
      return { rejected: true, error: (err as Error).message }
    }
  },
})

// ---- Test 11c: envelope bound to A cannot call B ----

export const testWrongCallee = action({
  args: {},
  returns: v.object({ rejected: v.boolean(), error: v.string() }),
  handler: async (ctx): Promise<{ rejected: boolean; error: string }> => {
    // Signed for some other function, but invoked against recordPayment.
    const envelope = await signServiceEnvelope(
      'expRunAsService:someOtherFunction',
      'stripe-webhook',
    )

    try {
      await ctx.runMutation(internal.expRunAsService.recordPayment, {
        event: { type: 'invoice.paid' },
        __principal: envelope,
      })
      return { rejected: false, error: '' }
    } catch (err) {
      return { rejected: true, error: (err as Error).message }
    }
  },
})

// ---- Test 11d: no envelope → systemCaller fallback ----

export const testNoEnvelope = action({
  args: {},
  returns: v.object({ principalKind: v.string(), service: v.optional(v.string()) }),
  handler: async (ctx): Promise<{ principalKind: string; service: string | undefined }> => {
    const result = await ctx.runMutation(internal.expRunAsService.recordPayment, {
      event: { type: 'cron.tick' },
      // no __principal — simulates scheduler / cron / CLI
    })
    return { principalKind: result.principalKind, service: result.service }
  },
})
