import { subject } from '@lupinum/trellis/auth'
import { createError, defineEventHandler, readBody } from 'h3'

import { api } from '#trellis/api'
import { delegateToUser, readSharedSecretWebhookBody, serverConvexMutation } from '#trellis/server'

type WebhookBody = {
  title?: string
  summary?: string
  content?: string
  visibility?: 'draft' | 'workspace' | 'public'
  tags?: string[]
}

function getWebhookSecret(): string {
  const secret = process.env.MCP_REFERENCE_WEBHOOK_SECRET?.trim()
  if (!secret) {
    throw createError({
      statusCode: 500,
      message: 'MCP_REFERENCE_WEBHOOK_SECRET is required for the webhook example.',
    })
  }

  return secret
}

function getWebhookActorUserId(): string {
  const userId = process.env.MCP_REFERENCE_WEBHOOK_USER_ID?.trim()
  if (!userId) {
    throw createError({
      statusCode: 500,
      message: 'MCP_REFERENCE_WEBHOOK_USER_ID is required for the webhook example.',
    })
  }

  return userId
}

function normalizeVisibility(value: WebhookBody['visibility']): 'draft' | 'workspace' | 'public' {
  if (!value) return 'workspace'
  if (value === 'draft' || value === 'workspace' || value === 'public') {
    return value
  }

  throw createError({
    statusCode: 400,
    message: 'visibility must be one of: draft, workspace, public.',
  })
}

function normalizeTags(value: WebhookBody['tags']): string[] {
  if (!value) return ['webhook']
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw createError({
      statusCode: 400,
      message: 'tags must be an array of strings when provided.',
    })
  }

  return value
}

export default defineEventHandler(async (event) => {
  const userId = getWebhookActorUserId()
  const body = await readSharedSecretWebhookBody({
    // Keep the transport check small so the service-caller + actingFor path is the thing being
    // demonstrated. Production senders should usually add timestamped HMAC verification too.
    signature: event.node.req.headers['x-example-signature'],
    secret: getWebhookSecret(),
    readBody: async () => await readBody<WebhookBody>(event),
    parse: (value: WebhookBody) => {
      if (!value.title?.trim()) {
        throw createError({
          statusCode: 400,
          message: 'title is required.',
        })
      }

      return value
    },
  })
  const title = body.title?.trim()
  if (!title) {
    throw createError({
      statusCode: 400,
      message: 'title is required.',
    })
  }

  // The webhook is the real caller, but it is allowed to act for one bound
  // workspace user so the app can authorize the mutation as that user.
  const runbookId = await serverConvexMutation(
    event,
    api.features.runbooks.domain.create,
    {
      title,
      summary: body.summary?.trim() || 'Created by the verified webhook example.',
      content:
        body.content?.trim() ||
        ['# Imported runbook', '', 'This runbook came through the verified webhook path.'].join(
          '\n',
        ),
      visibility: normalizeVisibility(body.visibility),
      tags: normalizeTags(body.tags),
    },
    {
      auth: 'trusted',
      caller: {
        kind: 'service',
        serviceId: 'runbook-webhook',
        subject: subject.service('runbook-webhook'),
      },
      actingFor: await delegateToUser({
        userId,
        allow: true,
        reason: 'verified runbook webhook',
      }),
    },
  )

  return {
    ok: true,
    runbookId,
  }
})
