import { subject } from '@lupinum/trellis/auth'
import { createError, defineEventHandler, readBody } from 'h3'

import { api } from '#trellis/api'
import { isWebhookSignatureValid, serverConvexMutation } from '#trellis/server'

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

function getWebhookActorAuthId(): string {
  const authId = process.env.MCP_REFERENCE_WEBHOOK_AUTH_ID?.trim()
  if (!authId) {
    throw createError({
      statusCode: 500,
      message: 'MCP_REFERENCE_WEBHOOK_AUTH_ID is required for the webhook example.',
    })
  }

  return authId
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
  const signature = event.node.req.headers['x-example-signature']
  if (!isWebhookSignatureValid(signature, getWebhookSecret())) {
    throw createError({ statusCode: 401, message: 'Invalid signature' })
  }

  const body = await readBody<WebhookBody>(event)
  if (!body.title?.trim()) {
    throw createError({
      statusCode: 400,
      message: 'title is required.',
    })
  }

  const authId = getWebhookActorAuthId()

  // The webhook is the real caller, but it is allowed to act for one bound
  // workspace user so the app can authorize the mutation as that user.
  const runbookId = await serverConvexMutation(
    event,
    api.features.runbooks.domain.create,
    {
      title: body.title.trim(),
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
      principal: {
        kind: 'service',
        serviceId: 'runbook-webhook',
        subject: subject.service('runbook-webhook'),
      },
      delegation: {
        subject: subject.user(authId),
        reason: 'verified runbook webhook',
      },
    },
  )

  return {
    ok: true,
    runbookId,
  }
})
