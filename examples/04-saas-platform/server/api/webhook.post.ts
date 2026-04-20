/**
 * Why this file exists:
 * Nitro routes often need to accept verified external requests, validate the payload, and then
 * hand work to a narrow internal Convex entrypoint.
 */
import { createError, defineEventHandler, readBody } from 'h3'

import { isWebhookSignatureValid, serverConvexMutation } from '#trellis/server'

import { internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

type WebhookBody = {
  projectId?: string
  title?: string
  priority?: 'low' | 'medium' | 'high'
}

function getWebhookSecret(): string {
  const secret = process.env.PROJECT_BOARD_WEBHOOK_SECRET?.trim()
  if (!secret) {
    throw createError({
      statusCode: 500,
      message: 'PROJECT_BOARD_WEBHOOK_SECRET is required for the webhook example.',
    })
  }

  return secret
}
export default defineEventHandler(async (event) => {
  const signature = event.node.req.headers['x-example-signature']
  if (!isWebhookSignatureValid(signature, getWebhookSecret())) {
    throw createError({ statusCode: 401, message: 'Invalid signature' })
  }

  const body = await readBody<WebhookBody>(event)
  if (!body.projectId || !body.title) {
    throw createError({
      statusCode: 400,
      message: 'projectId and title are required.',
    })
  }

  const taskId = await serverConvexMutation(
    event,
    internal.features.tasks.webhooks.createTaskFromWebhookMutation,
    {
      projectId: body.projectId as Id<'projects'>,
      title: body.title,
      priority: body.priority ?? 'medium',
    },
    { auth: 'none' },
  )

  return {
    ok: true,
    taskId,
  }
})
