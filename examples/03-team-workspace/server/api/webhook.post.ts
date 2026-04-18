import { api } from '#trellis/api'
/**
 * Why this file exists:
 * Nitro route that receives external webhook payloads and forwards them to the Convex mutation.
 * The mutation handles its own auth (trusted caller key) and idempotency.
 */
import { serverConvexMutation } from '#trellis/server'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body?.trustedCallerKey || !body?.workspaceId || !body?.eventId || !body?.title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required fields: trustedCallerKey, workspaceId, eventId, title',
    })
  }

  const todoId = await serverConvexMutation(
    event,
    api.domain.webhooks.processTodoSyncWebhook,
    {
      trustedCallerKey: body.trustedCallerKey,
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
