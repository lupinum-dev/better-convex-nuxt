import { api } from '#convex/api'

export function useTaskRefs() {
  return {
    listTasks: api.tasks.list,
    createTask: api.tasks.create,
  }
}
