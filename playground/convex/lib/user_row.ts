import type { Actor, AnyCtx } from '../../../src/runtime/actor'

export async function getUserRowFromActor(
  ctx: AnyCtx,
  actor: Actor,
) {
  if (actor._id) {
    return await ctx.db.get(actor._id)
  }

  return await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q: any) => q.eq('authId', actor.userId))
    .first()
}
