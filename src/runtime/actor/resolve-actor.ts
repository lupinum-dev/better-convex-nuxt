import type { Actor, ActorConfig, AnyCtx, ArgsWithServiceAuth } from './types'

// ============================================================================
// Service key validation
// ============================================================================

async function validateServiceKey(
  config: ActorConfig,
  key: string,
  ctx: AnyCtx,
): Promise<boolean> {
  if (!config.serviceKey) return false

  if (typeof config.serviceKey === 'string') {
    return process.env[config.serviceKey] === key
  }

  return config.serviceKey(key, ctx)
}

// ============================================================================
// createTryResolveActor — returns Actor | null, never throws
// ============================================================================

export function createTryResolveActor(config: ActorConfig) {
  return async function tryResolveActor(
    ctx: AnyCtx,
    args: ArgsWithServiceAuth,
  ): Promise<Actor | null> {
    // Path 1: Service key injection (MCP / server-to-server)
    if (args._serviceKey && args._serviceActor) {
      const valid = await validateServiceKey(config, args._serviceKey, ctx)
      if (!valid) return null
      return {
        userId: args._serviceActor.userId,
        role: args._serviceActor.role,
        orgId: args._serviceActor.orgId,
      }
    }

    // Path 2: Browser auth via ctx.auth
    return config.resolveFromAuth(ctx)
  }
}

// ============================================================================
// createResolveActor — returns Actor, throws if not authenticated
// ============================================================================

export function createResolveActor(config: ActorConfig) {
  const tryResolve = createTryResolveActor(config)

  return async function resolveActor(
    ctx: AnyCtx,
    args: ArgsWithServiceAuth,
  ): Promise<Actor> {
    const actor = await tryResolve(ctx, args)
    if (!actor) {
      throw new Error('Authentication required.')
    }
    return actor
  }
}

// ============================================================================
// createRequireActor — returns Actor with orgId, throws if no auth or no org
// ============================================================================

export function createRequireActor(config: ActorConfig) {
  const resolve = createResolveActor(config)

  return async function requireActor(
    ctx: AnyCtx,
    args: ArgsWithServiceAuth,
  ): Promise<Actor & { orgId: string }> {
    const actor = await resolve(ctx, args)
    if (!actor.orgId) {
      throw new Error('Organization membership required.')
    }
    return actor as Actor & { orgId: string }
  }
}
