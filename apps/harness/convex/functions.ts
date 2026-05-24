import { defineTrellis } from '@lupinum/trellis/backend'

import { trellisObservability } from '../observability.config'
import type { DataModel } from './_generated/dataModel'
import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import type { HarnessDelegation } from './auth/actingFor'
import { actingFor } from './auth/actingFor'
import type { AppIdentity } from './auth/appIdentity'
import { getAppIdentityFromCaller } from './auth/appIdentity'
import type { InternalHarnessCaller } from './auth/caller'
import { caller } from './auth/caller'

async function requirePreviewIdentity(ctx: {
  appIdentity: () => Promise<AppIdentity>
}): Promise<NonNullable<AppIdentity>> {
  const appIdentity = await ctx.appIdentity()
  if (!appIdentity) throw new Error('Destructive preview confirmation requires identity.')
  return appIdentity
}

async function previewCallerKey(ctx: {
  appIdentity: () => Promise<AppIdentity>
  caller: () => Promise<InternalHarnessCaller>
}): Promise<string> {
  const resolvedCaller = await ctx.caller()
  if (resolvedCaller.kind === 'agent') {
    return `agent:${resolvedCaller.agentId}:${resolvedCaller.role}`
  }

  return (await requirePreviewIdentity(ctx)).userId
}

export const { mutation, query, unsafe } = defineTrellis<
  DataModel,
  'public',
  'public',
  'internal',
  'internal',
  InternalHarnessCaller,
  HarnessDelegation,
  AppIdentity
>(
  { query: generatedQuery, mutation: generatedMutation },
  {
    caller,
    actingFor,
    appIdentity: getAppIdentityFromCaller,
    isolation: {
      tables: ['posts', 'comments', 'mcpKeys'],
      field: 'organizationId',
    },
    destructiveOperations: {
      confirmationTable: 'destructiveConfirmations' as never,
      auditTable: 'destructiveAuditLog' as never,
      previewConfirmation: {
        callerKey: previewCallerKey,
        scopeKey: async (ctx) =>
          String((await requirePreviewIdentity(ctx)).workspaceId ?? 'global'),
      },
    },
    observability: trellisObservability,
  },
)
