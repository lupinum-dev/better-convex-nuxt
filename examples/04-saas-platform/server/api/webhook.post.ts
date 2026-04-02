/**
 * Why this file exists:
 * Nitro routes often need to act on behalf of external systems. This example shows the server
 * helper calling the same scoped mutation layer with trusted caller auth instead of browser cookies.
 */
import { createError, defineEventHandler, readBody } from 'h3'

import { serverConvexMutation } from '#trellis/server'
import { api } from '#trellis/api'
import type { Id } from '~/convex/_generated/dataModel'

type WebhookBody = {
  projectId?: string
  title?: string
  priority?: 'low' | 'medium' | 'high'
  createdBy?: string
}

export default defineEventHandler(async (event) => {
  const signature = event.node.req.headers['x-example-signature']
  if (signature !== 'project-board-demo') {
    throw createError({ statusCode: 401, message: 'Invalid signature' })
  }

  const body = await readBody<WebhookBody>(event)
  if (!body.projectId || !body.title || !body.createdBy) {
    throw createError({
      statusCode: 400,
      message: 'projectId, title, and createdBy are required.',
    })
  }

  const taskId = await serverConvexMutation(
    event,
    api.tasks.create,
    {
      projectId: body.projectId as Id<'projects'>,
      title: body.title,
      priority: body.priority ?? 'medium',
    },
    {
      auth: 'trusted',
      actor: {
        userId: body.createdBy,
      },
    },
  )

  return {
    ok: true,
    taskId,
  }
})
