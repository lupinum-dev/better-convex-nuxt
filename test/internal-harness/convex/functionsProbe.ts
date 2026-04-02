import { createFunctions } from 'better-convex-nuxt/functions'
import { Triggers } from 'convex-helpers/server/triggers'
import { v } from 'convex/values'

import type { DataModel } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'

let actorResolverCalls = 0

const triggers = new Triggers<DataModel>()

triggers.register('notes', async (ctx, change) => {
  if (change.operation !== 'insert' || !change.newDoc || change.newDoc.title) return
  await ctx.db.patch(change.id, { title: 'triggered' })
})

const { query: probeQuery, mutation: probeMutation } = createFunctions(query, mutation, {
  actor: async (ctx) => {
    actorResolverCalls += 1
    return await getActor(ctx)
  },
  tenantIsolation: {
    tables: ['posts', 'comments', 'mcpKeys'],
    field: 'organizationId',
  },
  triggers,
})

export const publicWithoutActor = probeQuery({
  args: {},
  handler: async () => ({
    actorResolverCalls,
  }),
})

export const resetActorResolverCalls = mutation({
  args: {},
  handler: async () => {
    actorResolverCalls = 0
    return actorResolverCalls
  },
})

export const actorMemoization = probeQuery({
  args: {},
  handler: async (ctx) => {
    const before = actorResolverCalls
    const first = await ctx.actor()
    const second = await ctx.actor()

    return {
      before,
      after: actorResolverCalls,
      sameReference: first === second,
      actor: first,
    }
  },
})

export const echoedArgs = probeQuery({
  args: {
    title: v.string(),
  },
  handler: async (_ctx, args) => args,
})

export const unsafeListPosts = probeQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('posts').order('desc').collect()
  },
})

export const unsafeRenamePost = probeMutation({
  args: {
    id: v.id('posts'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      title: args.title,
      updatedAt: Date.now(),
    })

    return await ctx.db.get(args.id)
  },
})

export const createTriggeredNote = probeMutation({
  args: {
    content: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('notes', {
      content: args.content,
      createdAt: Date.now(),
    })
  },
})

export const getNote = query({
  args: {
    id: v.id('notes'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})
