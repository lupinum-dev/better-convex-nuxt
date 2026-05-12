import { operationEffect, operationPreview } from '@lupinum/trellis/backend'
import type { OperationPreviewEnvelope } from '@lupinum/trellis/backend'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { v } from 'convex/values'
import type { Validator } from 'convex/values'
import { SignJWT, jwtVerify } from 'jose'

/**
 * Experiment 15: Operations as imported objects (no manifest)
 *
 * The current spec has a build-time AST walker (§24) that generates a
 * typed operations manifest. This experiment validates we can eliminate
 * that entirely: `defineOperation` returns a plain JS object whose
 * `.preview` and `.execute` projections are directly consumable by
 * Convex's `query()` and `mutation()` builders, and whose metadata
 * (name, kind, args) is directly importable by MCP code.
 *
 * Core claims:
 *   15a  `defineOperation({...})` returns an object with usable `.preview`
 *        and `.execute` projections. `query(op.preview)` and
 *        `mutation(op.execute)` yield working Convex functions.
 *   15b  The execute mutation handles both `__preview: true` (returns
 *        confirmation token) and execute-with-token in one atomic call.
 *   15c  Preview drift is detected between __preview and execute.
 *   15d  The operation object carries metadata MCP can read directly —
 *        `op.name`, `op.kind`, `op.args` — with no AST walker or manifest.
 *   15e  An MCP-shaped consumer can locate and validate an operation by
 *        directly importing it (simulated in-test), read its kind, and
 *        reject non-destructive ops when a destructive one is required.
 */
import { internalMutation, internalQuery } from './_generated/server'

// ============================================================
// Minimal defineOperation
// ============================================================

const ROOT_SECRET = new TextEncoder().encode('test-deployment-secret-32bytes!!')
const SALT = new TextEncoder().encode('trellis-v1')

function deriveKey(purpose: string): Uint8Array {
  return hkdf(sha256, ROOT_SECRET, SALT, new TextEncoder().encode(purpose), 32)
}

function canonicalHash(value: unknown): string {
  // Canonical JSON with sorted keys. Good enough for this experiment.
  const sortKeys = (x: any): any => {
    if (Array.isArray(x)) return x.map(sortKeys)
    if (x && typeof x === 'object') {
      return Object.fromEntries(
        Object.keys(x)
          .sort()
          .map((k) => [k, sortKeys(x[k])]),
      )
    }
    return x
  }
  return btoa(unescape(encodeURIComponent(JSON.stringify(sortKeys(value)))))
}

interface OperationConfig<Args, Loaded, Confirm extends Record<string, unknown>> {
  name: string
  kind: 'destructive' | 'safe'
  args: Record<string, Validator<any, 'required' | 'optional', any>>
  load: (ctx: any, args: Args) => Promise<Loaded>
  preview?: (ctx: any, args: Args, loaded: Loaded) => Promise<OperationPreviewEnvelope<Confirm>>
  handler: (ctx: any, args: Args, loaded: Loaded) => Promise<unknown>
}

/**
 * The claim: this function returns a plain object. Its `.preview` is
 * shaped like `{ args, handler }` (what `query(...)` expects). Its
 * `.execute` is shaped like `{ args, handler }` (what `mutation(...)`
 * expects). Both are built once at module-load time. No codegen, no
 * manifest, no AST walker.
 */
function defineOperation<Args, Loaded, Confirm extends Record<string, unknown>>(
  cfg: OperationConfig<Args, Loaded, Confirm>,
) {
  const purpose = 'trellis:mcp-confirmation:v1'
  const previewArgs = cfg.args
  // Execute needs two optional framework fields.
  const executeArgs = {
    ...cfg.args,
    __preview: v.optional(v.boolean()),
    __confirmationToken: v.optional(v.string()),
  }

  return {
    // ---- Metadata readable by MCP via plain import ----
    name: cfg.name,
    kind: cfg.kind,
    args: cfg.args,
    __trellis_operation: true as const,

    // ---- Preview projection (read-only, safe for query()) ----
    preview: {
      args: previewArgs,
      handler: async (ctx: any, args: Args) => {
        const loaded = await cfg.load(ctx, args)
        if (!cfg.preview) {
          throw new Error(`Operation '${cfg.name}' has no preview defined`)
        }
        const preview = await cfg.preview(ctx, args, loaded)
        const argsHash = canonicalHash(args)
        const previewHash = canonicalHash(preview.confirm)
        const token = await new SignJWT({
          v: 1,
          aud: purpose,
          callee: `expOperationsAsObjects:${cfg.name}`,
          argsHash,
          previewHash,
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setExpirationTime('5m')
          .setJti(crypto.randomUUID())
          .sign(deriveKey(purpose))
        return { preview, confirmationToken: token }
      },
    },

    // ---- Execute projection (mutation — handles both modes) ----
    execute: {
      args: executeArgs,
      handler: async (ctx: any, args: any) => {
        const handlerArgs = { ...args }
        delete handlerArgs.__preview
        delete handlerArgs.__confirmationToken

        if (args.__preview === true) {
          // Preview via mutation (rare — usually UI uses the preview query).
          // Same flow as preview projection.
          const loaded = await cfg.load(ctx, handlerArgs)
          if (!cfg.preview) throw new Error('no preview')
          const preview = await cfg.preview(ctx, handlerArgs, loaded)
          const argsHash = canonicalHash(handlerArgs)
          const previewHash = canonicalHash(preview.confirm)
          const token = await new SignJWT({
            v: 1,
            aud: purpose,
            callee: `expOperationsAsObjects:${cfg.name}`,
            argsHash,
            previewHash,
          })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('5m')
            .setJti(crypto.randomUUID())
            .sign(deriveKey(purpose))
          return { preview, confirmationToken: token }
        }

        // Destructive path.
        if (cfg.kind === 'destructive') {
          if (!args.__confirmationToken) {
            throw new Error('confirmation token required')
          }
          const { payload } = await jwtVerify(args.__confirmationToken, deriveKey(purpose), {
            audience: purpose,
          })
          if (payload.callee !== `expOperationsAsObjects:${cfg.name}`) {
            throw new Error('callee mismatch')
          }
          // Verify args hash.
          const expectedArgsHash = canonicalHash(handlerArgs)
          if (payload.argsHash !== expectedArgsHash) {
            throw new Error('args hash mismatch')
          }
          // Re-run load + preview, compare preview hash (drift detection).
          const loaded = await cfg.load(ctx, handlerArgs)
          if (!cfg.preview) throw new Error('no preview')
          const preview = await cfg.preview(ctx, handlerArgs, loaded)
          const previewHash = canonicalHash(preview.confirm)
          if (payload.previewHash !== previewHash) {
            throw new Error('preview hash mismatch — data drifted')
          }
          // Run handler.
          return await cfg.handler(ctx, handlerArgs, loaded)
        }

        // Safe operation: just load + handler.
        const loaded = await cfg.load(ctx, handlerArgs)
        return await cfg.handler(ctx, handlerArgs, loaded)
      },
    },
  }
}

// ============================================================
// Define a real operation against the expRunbooks table.
// ============================================================

export const archiveRunbookOp = defineOperation({
  name: 'archiveRunbook',
  kind: 'destructive' as const,
  args: {
    id: v.id('expRunbooks'),
  },
  load: async (ctx, args: { id: any }) => {
    const runbook = await ctx.db.get(args.id)
    return { runbook }
  },
  preview: async (_ctx, _args, loaded: { runbook: any }) =>
    operationPreview({
      summary: `Archive "${loaded.runbook?.title}"`,
      effects: [operationEffect({ kind: 'update', summary: 'Archive one runbook', count: 1 })],
      confirm: {
        operation: 'archiveRunbook',
        targetId: loaded.runbook?._id,
        currentTitle: loaded.runbook?.title,
      },
    }),
  handler: async (ctx, _args, loaded: { runbook: any }) => {
    await ctx.db.patch(loaded.runbook._id, { archived: true })
    return { archivedId: loaded.runbook._id }
  },
})

// ============================================================
// Project to Convex functions — THIS is the critical part.
// If these exports work, operation projections are valid Convex
// functions with no additional generation step.
// ============================================================

export const previewArchiveRunbook = internalQuery(archiveRunbookOp.preview as any)
export const archiveRunbook = internalMutation(archiveRunbookOp.execute as any)

// ============================================================
// Seed + helper
// ============================================================

export const seedRunbook = internalMutation({
  args: { orgId: v.id('organizations'), title: v.string() },
  returns: v.id('expRunbooks'),
  handler: async (ctx, args) => {
    return await ctx.db.insert('expRunbooks', {
      title: args.title,
      archived: false,
      organizationId: args.orgId,
    })
  },
})

export const renameRunbook = internalMutation({
  args: { id: v.id('expRunbooks'), title: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { title: args.title })
    return null
  },
})

export const getRunbook = internalQuery({
  args: { id: v.id('expRunbooks') },
  returns: v.union(
    v.null(),
    v.object({
      title: v.string(),
      archived: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.id)
    if (!r) return null
    return { title: r.title, archived: r.archived }
  },
})

// ============================================================
// Simulated MCP-side consumer
// ============================================================

/**
 * This simulates what `tool.operation(op)` does: it reads the
 * operation object's metadata directly. No manifest, no AST walk,
 * no string lookup.
 */
export const simulatedMcpIntrospection = internalQuery({
  args: {},
  returns: v.object({
    name: v.string(),
    kind: v.string(),
    hasPreview: v.boolean(),
    hasExecute: v.boolean(),
    argsKeys: v.array(v.string()),
    isMarkedTrellisOp: v.boolean(),
  }),
  handler: async (_ctx) => {
    // The MCP code imports the operation directly.
    const op = archiveRunbookOp
    return {
      name: op.name,
      kind: op.kind,
      hasPreview: typeof op.preview.handler === 'function',
      hasExecute: typeof op.execute.handler === 'function',
      argsKeys: Object.keys(op.args),
      isMarkedTrellisOp: op.__trellis_operation === true,
    }
  },
})

/**
 * Simulates tool.operation's runtime check: destructive-only path
 * rejects a safe operation.
 */
export const rejectSafeForDestructivePath = internalQuery({
  args: {},
  returns: v.object({ rejected: v.boolean(), kind: v.string() }),
  handler: async (_ctx) => {
    const safeOp = defineOperation({
      name: 'readOnly',
      kind: 'safe' as const,
      args: { id: v.string() },
      load: async () => ({}),
      handler: async () => ({ ok: true }),
    })
    const rejected = safeOp.kind !== 'destructive'
    return { rejected, kind: safeOp.kind }
  },
})
