import { createHash } from 'node:crypto'

import { defineEventHandler, getHeader, createError } from 'h3'

import { api } from '#trellis/api'
import { serverConvexQuery } from '@lupinum/trellis/server'

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
  const key = await serverConvexQuery(event, api.domain.mcpKeys.validate, { hash }, { auth: 'none' })
  if (!key) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid MCP bearer token.' })
  }

  event.context.mcpAuth = key
})
