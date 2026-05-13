import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { v } from 'convex/values'
import { SignJWT, jwtVerify } from 'jose'

/**
 * Experiment 4: Atomic Execute Mutation
 *
 * Validates that the spec's destructive MCP flow (10-step) works
 * in one Convex mutation transaction: JWT verification + hash checks
 * + jti confirmation + handler execution + audit write — all atomic.
 */
import { internalMutation } from './_generated/server'

// ---- Shared crypto helpers ----

const DEPLOYMENT_SECRET = new TextEncoder().encode('test-deployment-secret-32bytes!!')
const SALT = new TextEncoder().encode('trellis-v1')
const INFO = new TextEncoder().encode('trellis:mcp-confirmation:v1')

function deriveKey() {
  return hkdf(sha256, DEPLOYMENT_SECRET, SALT, INFO, 32)
}

function computeHash(data: string): string {
  // Simple hash for testing — in production would use crypto.subtle
  // Use full base64 to avoid collisions from truncation
  return btoa(data)
}

function generateJti(): string {
  return `jti_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

// ---- Preview mutation ----

export const preview = internalMutation({
  args: { postId: v.id('posts') },
  handler: async (ctx, args) => {
    // Load the post from raw db
    const post = await ctx.db.get(args.postId)
    if (!post) throw new Error('Post not found')

    // Compute hashes
    const argsHash = computeHash(JSON.stringify({ postId: args.postId }))
    const previewHash = computeHash(`${post.title}:${post._id}`)

    // Mint JWT
    const key = deriveKey()
    const jti = generateJti()

    const token = await new SignJWT({
      aud: 'trellis:mcp-confirmation:v1',
      callee: 'posts:deletePost',
      v: 1,
      argsHash,
      previewHash,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .setJti(jti)
      .sign(key)

    return {
      preview: {
        operation: 'deletePost' as const,
        targetTitle: post.title,
        targetId: post._id,
      },
      token,
    }
  },
})

// ---- Execute mutation (10-step atomic) ----

export const execute = internalMutation({
  args: {
    token: v.string(),
    postId: v.id('posts'),
  },
  handler: async (ctx, args) => {
    const key = deriveKey()

    // Step 1: Verify JWT with HKDF-derived key + audience check
    const { payload } = await jwtVerify(args.token, key, {
      audience: 'trellis:mcp-confirmation:v1',
    })

    // Step 2: Extract claims
    const { argsHash, previewHash, jti, callee } = payload as {
      argsHash: string
      previewHash: string
      jti: string
      callee: string
    }

    // Step 3: Check callee matches expected operation
    if (callee !== 'posts:deletePost') {
      throw new Error(`Callee mismatch: expected posts:deletePost, got ${callee}`)
    }

    // Step 4: Recompute argsHash from current args, compare
    const currentArgsHash = computeHash(JSON.stringify({ postId: args.postId }))
    if (currentArgsHash !== argsHash) {
      throw new Error('Args hash mismatch — arguments were tampered')
    }

    // Step 5: Load the post (re-run load)
    const post = await ctx.db.get(args.postId)
    if (!post) throw new Error('Post not found')

    // Step 6: Recompute previewHash, compare (drift detection)
    const currentPreviewHash = computeHash(`${post.title}:${post._id}`)
    if (currentPreviewHash !== previewHash) {
      throw new Error('Preview hash mismatch — data changed since preview (drift detected)')
    }

    // Step 7: Redeem jti — check for replay
    const existing = await ctx.db
      .query('expJtiLog')
      .withIndex('by_jti', (q) => q.eq('jti', jti))
      .unique()
    if (existing) {
      throw new Error('jti already redeemed')
    }

    // Step 8: Insert jti into expJtiLog
    await ctx.db.insert('expJtiLog', {
      jti,
      redeemedAt: Date.now(),
    })

    // Step 9: Delete the post
    await ctx.db.delete(args.postId)

    // Step 10: Write audit log entry
    await ctx.db.insert('expAuditLog', {
      operation: 'deletePost',
      callerKey: 'mcp-test-caller',
      argsHash: currentArgsHash,
      previewHash: currentPreviewHash,
      timestamp: Date.now(),
    })

    return {
      success: true as const,
      deletedPostId: args.postId,
      auditWritten: true as const,
    }
  },
})

// ---- Helpers for test: mint tokens with custom options ----

export const mintExpiredToken = internalMutation({
  args: { postId: v.id('posts') },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId)
    if (!post) throw new Error('Post not found')

    const argsHash = computeHash(JSON.stringify({ postId: args.postId }))
    const previewHash = computeHash(`${post.title}:${post._id}`)

    const key = deriveKey()
    const jti = generateJti()

    // Mint a token that is already expired
    const expiredToken = await new SignJWT({
      aud: 'trellis:mcp-confirmation:v1',
      callee: 'posts:deletePost',
      v: 1,
      argsHash,
      previewHash,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 600) // 10 min ago
      .setExpirationTime(Math.floor(Date.now() / 1000) - 300) // expired 5 min ago
      .setJti(jti)
      .sign(key)

    return { token: expiredToken }
  },
})
