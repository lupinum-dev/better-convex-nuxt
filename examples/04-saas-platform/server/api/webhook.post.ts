/**
 * Why this file exists:
 * Nitro routes often need to act on behalf of external systems. This example shows the server
 * helper calling the same scoped mutation layer with trusted caller auth instead of browser cookies.
 */
import { createError, defineEventHandler, readBody } from 'h3'

import { api } from '#trellis/api'
import { serverConvexMutation } from '#trellis/server'
import type { Id } from '~/convex/_generated/dataModel'

type WebhookBody = {
  projectId?: string
  title?: string
  priority?: 'low' | 'medium' | 'high'
}

function getWebhookActorUserId(): string {
  const actorUserId = process.env.PROJECT_BOARD_WEBHOOK_ACTOR_ID?.trim()
  if (!actorUserId) {
    throw createError({
      statusCode: 500,
      message: 'PROJECT_BOARD_WEBHOOK_ACTOR_ID is required for the webhook example.',
    })
  }

  return actorUserId
}

export default defineEventHandler(async (event) => {
  const signature = event.node.req.headers['x-example-signature']
  if (signature !== 'project-board-demo') {
    throw createError({ statusCode: 401, message: 'Invalid signature' })
  }

  const body = await readBody<WebhookBody>(event)
  if (!body.projectId || !body.title) {
    throw createError({
      statusCode: 400,
      message: 'projectId and title are required.',
    })
  }

  const actorUserId = getWebhookActorUserId()

  const taskId = await serverConvexMutation(
    event,
    api.domain.tasks.create,
    {
      projectId: body.projectId as Id<'projects'>,
      title: body.title,
      priority: body.priority ?? 'medium',
    },
    {
      auth: 'trusted',
      actor: {
        userId: actorUserId,
      },
    },
  )

  return {
    ok: true,
    taskId,
  }
})
