import { defineEventHandler } from 'h3'

import { createTask } from '../../shared/task'

export default defineEventHandler(() => {
  return createTask.validate({ title: 'Server-safe schema import works' })
})
