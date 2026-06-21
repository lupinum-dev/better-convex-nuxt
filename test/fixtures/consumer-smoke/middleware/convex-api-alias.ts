import { api } from '#convex/api'

export default defineNuxtRouteMiddleware(() => {
  void api.tasks.list
})
