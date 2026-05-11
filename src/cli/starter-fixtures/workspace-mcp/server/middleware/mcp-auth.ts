import { createHash } from 'node:crypto'

import { serverConvexQuery } from '@lupinum/trellis/server'
import { defineEventHandler, getHeader, createError } from 'h3'

import { api } from '#trellis/api'

export default defineEventHandler(async (event) => {
  const header = getHeader(event, 'authorization')
  if (!header?.startsWith('Bearer ')) {
    return
  }

  const token = header.slice('Bearer '.length).trim()
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Missing MCP bearer token.' })
  }

  const hash = createHash('sha256').update(token).digest('hex')
  const key = await serverConvexQuery(
    event,
    api.features.mcpKeys.domain.validate,
    { hash },
    { auth: 'none' },
  )
  if (!key) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid MCP bearer token.' })
  }

  event.context.mcpAuth = key
})
