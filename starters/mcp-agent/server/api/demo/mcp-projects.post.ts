import { createError, readBody } from 'h3'

import { useRuntimeConfig } from '#imports'

import { createMcpProjectRequestSchema } from '../../../shared/inputSchemas'
import { createProjectForServiceActor, createProjectToolClient } from '../../utils/mcpProjectTools'

export default defineEventHandler(async (event) => {
  const rawBody = await readBody(event)
  const bodyResult = createMcpProjectRequestSchema.safeParse(rawBody)
  if (!bodyResult.success) {
    throw createError({
      statusCode: 400,
      statusMessage: bodyResult.error.issues[0]?.message ?? 'Invalid request',
    })
  }
  const body = bodyResult.data
  const projectId = await createProjectForServiceActor(
    {
      getClient: () => {
        const config = useRuntimeConfig()
        const convex = config.public.convex as { url?: string } | undefined
        return createProjectToolClient(convex?.url)
      },
      getServerSecret: () => useRuntimeConfig().mcpServerSecret,
    },
    {
      bearerToken: body.bearerToken,
      name: body.name,
    },
  )

  return { content: [`Created project ${projectId}`] }
})
