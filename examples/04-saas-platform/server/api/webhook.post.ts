/**
 * Why this file exists:
 * Nitro routes often need to accept verified external requests, validate the payload, and then
 * hand work to a narrow internal Convex entrypoint.
 *
 * This example intentionally stops at the route-owned boundary. Example 07 shows the fuller
 * identity-forwarding model where a service caller and delegated user flow through the protected
 * root refs themselves.
 */
import { createError, defineEventHandler, readBody } from 'h3'

import { readSharedSecretWebhookBody, serverConvexMutation } from '#trellis/server'

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
  const body = await readSharedSecretWebhookBody({
    // Demo transport boundary: shared route secret only. Add timestamped HMAC verification and a
    // replay window in production if the sender supports it.
    signature: event.node.req.headers['x-example-signature'],
    secret: getWebhookSecret(),
    readBody: async () => await readBody<WebhookBody>(event),
    parse: (value: WebhookBody) => {
      if (!value.projectId || !value.title) {
        throw createError({
          statusCode: 400,
          message: 'projectId and title are required.',
        })
      }

      return value as Required<Pick<WebhookBody, 'projectId' | 'title'>> & WebhookBody
    },
  })

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
