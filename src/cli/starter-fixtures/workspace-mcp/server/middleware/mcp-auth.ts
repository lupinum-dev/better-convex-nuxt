import { createHash } from 'node:crypto'

import { serverConvexMutation, serverConvexQuery } from '@lupinum/trellis/server'
import { defineEventHandler, getHeader, createError } from 'h3'

import { api } from '#trellis/api'

import { assertInvalidBearerBudget, recordInvalidBearer } from '../lib/mcp-invalid-bearer-throttle'

export default defineEventHandler(async (event) => {
  if (!event.path?.startsWith('/mcp')) return

  const header = getHeader(event, 'authorization')
  if (!header?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, statusMessage: 'MCP bearer token required.' })
  }

  assertInvalidBearerBudget(event)

  const token = header.slice('Bearer '.length).trim()
  if (!token.startsWith('mcp_')) {
    recordInvalidBearer(event)
    throw createError({ statusCode: 401, statusMessage: 'Invalid MCP bearer token.' })
  }

  const hash = createHash('sha256').update(token).digest('hex')
  const key = await serverConvexQuery(
    event,
    api.features.mcpKeys.domain.validate,
    { hash },
    { auth: 'none' },
  )
  if (!key) {
    recordInvalidBearer(event)
    throw createError({ statusCode: 401, statusMessage: 'Invalid MCP bearer token.' })
  }

  event.context.mcpAuth = key

  serverConvexMutation(event, api.features.mcpKeys.domain.touch, { hash }, { auth: 'none' }).catch(
    () => {},
  )
})
