import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const createTodo = defineArgs({
  description: 'Create a personal todo',
  args: {
    title: v.string(),
  },
})

export const listTodos = defineArgs({
  description: 'List the current todo collection',
  args: {},
})
