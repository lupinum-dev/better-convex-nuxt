/**
 * Why this file exists:
 * Server-side CSV export is a common "real app" feature and proves that Nitro can call the same
 * Convex query layer without duplicating access checks.
 */
import { createError, defineEventHandler, getQuery, setResponseHeader } from 'h3'

import { api } from '#trellis/api'
import { serverConvexQuery } from '#trellis/server'

import type { Id } from '../../convex/_generated/dataModel'

function escapeCsvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const projectId = query.projectId

  if (typeof projectId !== 'string') {
    throw createError({ statusCode: 400, message: 'projectId is required.' })
  }

  const tasks = await serverConvexQuery(
    event,
    api.features.tasks.domain.listForExport,
    { projectId: projectId as Id<'projects'> },
    { auth: 'required' },
  )

  const csv = [
    'title,status,priority,assignee,createdAt',
    ...tasks.map((task: (typeof tasks)[number]) =>
      [
        task.title,
        task.status,
        task.priority,
        task.assigneeId ?? '',
        new Date(task.createdAt).toISOString(),
      ]
        .map(escapeCsvCell)
        .join(','),
    ),
  ].join('\n')

  setResponseHeader(event, 'content-type', 'text/csv')
  setResponseHeader(event, 'content-disposition', `attachment; filename="project-${projectId}.csv"`)

  return csv
})
