import { subject } from '@lupinum/trellis/auth'
/**
 * Why this file exists:
 * Nitro route that receives external webhook payloads and forwards them to a protected Convex
 * mutation after verifying a server-owned signature.
 *
 * This example keeps the transport boundary deliberately small. The important thing to study is the
 * trusted caller plus delegated user that reaches the protected mutation, while replay protection
 * lives in the app layer through processed event ids.
 */
import { createError, defineEventHandler, readBody } from 'h3'
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'

import { delegateToUser, readSharedSecretWebhookBody, serverConvexMutation } from '#trellis/server'

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

function getWebhookActorUserId(): string {
  const userId = process.env.TEAM_WORKSPACE_WEBHOOK_USER_ID?.trim()
  if (!userId) {
    throw createError({
      statusCode: 500,
      message: 'TEAM_WORKSPACE_WEBHOOK_USER_ID is required for the webhook example.',
    })
  }

  return userId
}

export default defineEventHandler(async (event) => {
  const userId = getWebhookActorUserId()
  const body = await readSharedSecretWebhookBody({
    // Demo route boundary: one shared secret header. Production integrations usually add a
    // timestamped HMAC scheme and replay window on top of this before forwarding inward.
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
      caller: {
        kind: 'service',
        serviceId: 'team-workspace-webhook',
        subject: subject.service('team-workspace-webhook'),
      },
      actingFor: await delegateToUser({
        userId,
        allow: true,
        reason: 'verified workspace todo webhook',
      }),
    },
  )

  return { ok: true, todoId }
})
