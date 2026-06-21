import { api } from '#convex/api'
import { serverConvexMutation, serverConvexQuery } from '#convex/server'

export default defineEventHandler(async (event) => {
  const tasks = await serverConvexQuery(event, api.tasks.list, {})
  const createdTaskId = await serverConvexMutation(event, api.tasks.create, {
    text: 'created from server alias smoke',
  })

  return {
    createdTaskId,
    taskCount: tasks.length,
  }
})
