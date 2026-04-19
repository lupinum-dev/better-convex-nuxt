import { customQuery, customMutation } from 'convex-helpers/server/customFunctions'

/**
 * Experiment 6: Service Principal Structural Detection
 *
 * Proves that service principal detection is STRUCTURAL — the builder
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
type Principal = { kind: 'anonymous' } | { kind: 'user'; userId: string } | { kind: 'system' }

// ---- Public builders: no auth → anonymous ----

const publicQuery = customQuery(rawQuery, {
  args: {},
  input: async (ctx, _args) => {
    const identity = await ctx.auth.getUserIdentity()
    const principal: Principal = identity
      ? { kind: 'user', userId: identity.subject }
      : { kind: 'anonymous' }
    return { ctx: { principal }, args: {} }
  },
})

const publicMutation = customMutation(rawMutation, {
  args: {},
  input: async (ctx, _args) => {
    const identity = await ctx.auth.getUserIdentity()
    const principal: Principal = identity
      ? { kind: 'user', userId: identity.subject }
      : { kind: 'anonymous' }
    return { ctx: { principal }, args: {} }
  },
})

// ---- Internal builders: no auth → system ----

const internalTrellisQuery = customQuery(rawInternalQuery, {
  args: {},
  input: async (ctx, _args) => {
    const identity = await ctx.auth.getUserIdentity()
    const principal: Principal = identity
      ? { kind: 'user', userId: identity.subject }
      : { kind: 'system' }
    return { ctx: { principal }, args: {} }
  },
})

const internalTrellisMutation = customMutation(rawInternalMutation, {
  args: {},
  input: async (ctx, _args) => {
    const identity = await ctx.auth.getUserIdentity()
    const principal: Principal = identity
      ? { kind: 'user', userId: identity.subject }
      : { kind: 'system' }
    return { ctx: { principal }, args: {} }
  },
})

// ---- Exported functions for testing ----

export const getPublicPrincipal = publicQuery({
  args: {},
  handler: async (ctx, _args) => {
    return { kind: ctx.principal.kind }
  },
})

export const getInternalPrincipal = internalTrellisQuery({
  args: {},
  handler: async (ctx, _args) => {
    return { kind: ctx.principal.kind }
  },
})

export const getPublicMutationPrincipal = publicMutation({
  args: {},
  handler: async (ctx, _args) => {
    return { kind: ctx.principal.kind }
  },
})

export const getInternalMutationPrincipal = internalTrellisMutation({
  args: {},
  handler: async (ctx, _args) => {
    return { kind: ctx.principal.kind }
  },
})
