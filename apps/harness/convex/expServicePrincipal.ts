import { customQuery, customMutation } from 'convex-helpers/server/customFunctions'

/**
 * Experiment 6: Service Caller Structural Detection
 *
 * Proves that service caller detection is STRUCTURAL — the builder
 * type determines the resolution path at definition time, not a runtime
 * heuristic. Public builders (query/mutation) resolve no-auth to
 * `anonymous`. Internal builders (internalQuery/internalMutation) resolve
 * no-auth to `system`.
 */
import {
  query as rawQuery,
  mutation as rawMutation,
  internalQuery as rawInternalQuery,
  internalMutation as rawInternalMutation,
} from './_generated/server'

// ---- Types ----
type Caller = { kind: 'anonymous' } | { kind: 'user'; userId: string } | { kind: 'system' }

// ---- Public builders: no auth → anonymous ----

const publicQuery = customQuery(rawQuery, {
  args: {},
  input: async (ctx, _args) => {
    const identity = await ctx.auth.getUserIdentity()
    const caller: Caller = identity
      ? { kind: 'user', userId: identity.tokenIdentifier }
      : { kind: 'anonymous' }
    return { ctx: { caller }, args: {} }
  },
})

const publicMutation = customMutation(rawMutation, {
  args: {},
  input: async (ctx, _args) => {
    const identity = await ctx.auth.getUserIdentity()
    const caller: Caller = identity
      ? { kind: 'user', userId: identity.tokenIdentifier }
      : { kind: 'anonymous' }
    return { ctx: { caller }, args: {} }
  },
})

// ---- Internal builders: no auth → system ----

const internalTrellisQuery = customQuery(rawInternalQuery, {
  args: {},
  input: async (ctx, _args) => {
    const identity = await ctx.auth.getUserIdentity()
    const caller: Caller = identity
      ? { kind: 'user', userId: identity.tokenIdentifier }
      : { kind: 'system' }
    return { ctx: { caller }, args: {} }
  },
})

const internalTrellisMutation = customMutation(rawInternalMutation, {
  args: {},
  input: async (ctx, _args) => {
    const identity = await ctx.auth.getUserIdentity()
    const caller: Caller = identity
      ? { kind: 'user', userId: identity.tokenIdentifier }
      : { kind: 'system' }
    return { ctx: { caller }, args: {} }
  },
})

// ---- Exported functions for testing ----

export const getPublicPrincipal = publicQuery({
  args: {},
  handler: async (ctx, _args) => {
    return { kind: ctx.caller.kind }
  },
})

export const getInternalPrincipal = internalTrellisQuery({
  args: {},
  handler: async (ctx, _args) => {
    return { kind: ctx.caller.kind }
  },
})

export const getPublicMutationPrincipal = publicMutation({
  args: {},
  handler: async (ctx, _args) => {
    return { kind: ctx.caller.kind }
  },
})

export const getInternalMutationPrincipal = internalTrellisMutation({
  args: {},
  handler: async (ctx, _args) => {
    return { kind: ctx.caller.kind }
  },
})
