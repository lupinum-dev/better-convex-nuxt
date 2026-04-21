import { subject } from '@lupinum/trellis/auth'
/**
 * Why this file exists:
 * Nitro route that receives external webhook payloads and forwards them to a protected Convex
 * mutation after verifying a server-owned signature.
 */
import { createError, defineEventHandler, readBody } from 'h3'
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'

import { delegateToUser, readVerifiedWebhookBody, serverConvexMutation } from '#trellis/server'

type WebhookBody = {
  workspaceId?: string
  eventId?: string
  title?: string
  completed?: boolean
  externalId?: string
}

function getWebhookSecret(): string {
  const secret = process.env.TEAM_WORKSPACE_WEBHOOK_SECRET?.trim()
  if (!secret) {
    throw createError({
      statusCode: 500,
      message: 'TEAM_WORKSPACE_WEBHOOK_SECRET is required for the webhook example.',
    })
  }

  return secret
}

function getWebhookActorAuthId(): string {
  const authId = process.env.TEAM_WORKSPACE_WEBHOOK_AUTH_ID?.trim()
  if (!authId) {
    throw createError({
      statusCode: 500,
      message: 'TEAM_WORKSPACE_WEBHOOK_AUTH_ID is required for the webhook example.',
    })
  }

  return authId
}

export default defineEventHandler(async (event) => {
  const authId = getWebhookActorAuthId()
  const body = await readVerifiedWebhookBody({
    signature: event.node.req.headers['x-example-signature'],
    secret: getWebhookSecret(),
    readBody: async () => await readBody<WebhookBody>(event),
    parse: (value) => {
      if (!value.workspaceId || !value.eventId || !value.title) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Missing required fields: workspaceId, eventId, title',
        })
      }

      return value as Required<Pick<WebhookBody, 'workspaceId' | 'eventId' | 'title'>> & WebhookBody
    },
  })

  const todoId = await serverConvexMutation(
    event,
    api.features.todos.webhooks.processTodoSyncWebhookMutation,
    {
      workspaceId: body.workspaceId as Id<'workspaces'>,
      eventId: body.eventId,
      title: body.title,
      completed: body.completed,
      externalId: body.externalId,
    },
    {
      auth: 'trusted',
      principal: {
        kind: 'service',
        serviceId: 'team-workspace-webhook',
        subject: subject.service('team-workspace-webhook'),
      },
      delegation: await delegateToUser({
        userId: authId,
        allow: true,
        reason: 'verified workspace todo webhook',
      }),
    },
  )

  return { ok: true, todoId }
})
