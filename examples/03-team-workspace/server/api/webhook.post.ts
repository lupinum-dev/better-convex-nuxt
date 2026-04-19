/**
 * Why this file exists:
 * Nitro route that receives external webhook payloads and forwards them to an internal Convex
 * mutation after verifying a server-owned signature.
 */
import { createError, defineEventHandler, readBody } from 'h3'

import { serverConvexMutation } from '#trellis/server'
import { internal } from '~/convex/_generated/api'

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

export default defineEventHandler(async (event) => {
  const signature = event.node.req.headers['x-example-signature']
  if (signature !== getWebhookSecret()) {
    throw createError({ statusCode: 401, message: 'Invalid signature' })
  }

  const body = await readBody<WebhookBody>(event)

  if (!body.workspaceId || !body.eventId || !body.title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required fields: workspaceId, eventId, title',
    })
  }

  const todoId = await serverConvexMutation(
    event,
    internal.domain.webhooks.processTodoSyncWebhook,
    {
      workspaceId: body.workspaceId,
      eventId: body.eventId,
      title: body.title,
      completed: body.completed,
      externalId: body.externalId,
    },
    { auth: 'none' },
  )

  return { ok: true, todoId }
})
