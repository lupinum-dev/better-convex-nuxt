/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GenericDataModel, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import { getTrustedCaller } from '../trusted-caller'
import { getAuth, type AuthIdentity } from './index'

/**
 * The default actor shape provided by the module.
 * Convention-based: reads `role` and `workspaceId` from the user row if present.
 */
export type DefaultActor = {
  kind: 'user'
  userId: string
  role: string
  tenantId?: string
}

type AnyCtx<DataModel extends GenericDataModel = GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

/**
 * Options for extending the default actor with additional fields.
 *
 * @example
 * ```ts
 * export default defineActorExtension({
 *   fields: async (ctx, user) => ({
 *     plan: (await ctx.db.get(user.workspaceId))?.plan ?? 'free',
 *   }),
 * })
 * ```
 */
export interface DefineActorExtensionOptions<TExtra extends Record<string, unknown>> {
  fields: (ctx: any, user: any) => Promise<TExtra>
}

/**
 * Define extra fields to merge into the default actor.
 * The extension is applied after the base actor is resolved.
 */
export function defineActorExtension<TExtra extends Record<string, unknown>>(
  options: DefineActorExtensionOptions<TExtra>,
) {
  return options
}

/**
 * Create a default `getActor` function using module conventions.
 *
 * Convention:
 * - User table has `authId` field + `by_auth_id` index
 * - If user has `role`, it's included in the actor
 * - If user has `workspaceId`, it becomes `tenantId`
 *
 * @param extension - Optional actor extension from `defineActorExtension`
 */
export function createDefaultGetActor<
  DataModel extends GenericDataModel = GenericDataModel,
  TExtra extends Record<string, unknown> = Record<string, never>,
>(extension?: DefineActorExtensionOptions<TExtra>) {
  return async function getActor(ctx: AnyCtx<DataModel>): Promise<(DefaultActor & TExtra) | null> {
    const trusted = getTrustedCaller(ctx)
    const auth: AuthIdentity | null = trusted ? { subject: trusted.userId } : await getAuth(ctx)

    if (!auth) return null

    const user = await (ctx.db as any)
      .query('users')
      .withIndex('by_auth_id', (q: any) => q.eq('authId', auth.subject))
      .first()

    if (!user) return null

    const base: DefaultActor = {
      kind: 'user',
      userId: user.authId,
      role: user.role ?? 'member',
      ...(user.workspaceId ? { tenantId: user.workspaceId } : {}),
    }

    if (extension) {
      const extra = await extension.fields(ctx, user)
      return { ...base, ...extra } as DefaultActor & TExtra
    }

    return base as DefaultActor & TExtra
  }
}

/**
 * Create an actor resolver for multi-workspace apps where the role
 * comes from a membership table rather than the user row.
 *
 * @example
 * ```ts
 * export const getActor = defineActorFromMembership({
 *   membershipTable: 'memberships',
 *   roleField: 'role',
 * })
 * ```
 */
export function defineActorFromMembership<
  DataModel extends GenericDataModel = GenericDataModel,
>(options: { membershipTable: string; roleField: string; workspaceField?: string }) {
  const { membershipTable, roleField, workspaceField = 'workspaceId' } = options

  return async function getActor(ctx: AnyCtx<DataModel>): Promise<DefaultActor | null> {
    const trusted = getTrustedCaller(ctx)
    const auth: AuthIdentity | null = trusted ? { subject: trusted.userId } : await getAuth(ctx)

    if (!auth) return null

    const user = await (ctx.db as any)
      .query('users')
      .withIndex('by_auth_id', (q: any) => q.eq('authId', auth.subject))
      .first()

    if (!user) return null

    // Look up membership to get role and workspace
    const membership = await (ctx.db as any)
      .query(membershipTable)
      .withIndex('by_user', (q: any) => q.eq('userId', user._id))
      .first()

    if (!membership) return null

    return {
      kind: 'user',
      userId: user.authId,
      role: membership[roleField],
      tenantId: membership[workspaceField],
    }
  }
}
