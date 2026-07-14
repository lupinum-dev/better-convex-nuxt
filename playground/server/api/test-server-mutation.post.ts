import type { H3Event } from 'h3'
import { createError, defineEventHandler, getRequestWebStream, setHeaders } from 'h3'

import { api } from '#convex/api'
import { serverConvex } from '#convex/server'

const maxRequestBodyBytes = 8 * 1024

function closeConnection(event: H3Event) {
  if (event.node.res.headersSent) return
  event.node.res.shouldKeepAlive = false
  event.node.req.pause()
  setHeaders(event, { connection: 'close' })
}

async function readBoundedJsonBody(event: H3Event) {
  const contentLength = Number(event.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxRequestBodyBytes) {
    closeConnection(event)
    throw createError({ statusCode: 413, statusMessage: 'Request body too large' })
  }

  const stream = getRequestWebStream(event)
  if (!stream) return {}
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value)
      totalBytes += chunk.byteLength
      if (totalBytes > maxRequestBodyBytes) {
        closeConnection(event)
        throw createError({ statusCode: 413, statusMessage: 'Request body too large' })
      }
      chunks.push(chunk)
    }
  } catch (error) {
    try {
      await reader.cancel(error)
    } catch {
      // The response still fails closed when the request stream cannot be cancelled.
    }
    throw error
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON body' })
  }
}

/**
 * Test API endpoint that demonstrates server-side mutations using serverConvex.
 *
 * This endpoint creates a new note using the Convex mutation from the server.
 * It shows how you can use serverConvex in API routes, webhooks, or background jobs.
 */
export default defineEventHandler(async (event: H3Event) => {
  const rawBody = await readBoundedJsonBody(event)
  const body =
    rawBody && typeof rawBody === 'object'
      ? (rawBody as { title?: unknown; content?: unknown })
      : {}

  const title =
    typeof body.title === 'string' && body.title.length > 0
      ? body.title
      : `Server Note ${new Date().toISOString()}`
  const content =
    typeof body.content === 'string' && body.content.length > 0
      ? body.content
      : 'Created from server-side API route using serverConvex'

  try {
    // Use the new serverConvex caller!
    // This is the key feature being tested - server-side mutations
    const noteId = await serverConvex(event).mutation(api.notes.add, { title, content })

    return {
      success: true,
      message: 'Note created from server!',
      noteId,
      createdAt: new Date().toISOString(),
      meta: {
        title,
        content,
        executedOn: 'server',
      },
    }
  } catch (error) {
    if (
      import.meta.dev &&
      error instanceof Error &&
      error.message.includes('Convex URL is not configured')
    ) {
      throw createError({ statusCode: 500, message: error.message })
    }
    throw createError({ statusCode: 500, statusMessage: 'Failed to create note' })
  }
})
