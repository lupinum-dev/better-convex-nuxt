/**
 * Why this file exists:
 * Even in a tiny example, the shared args definition shows the preferred V2 habit:
 * define the input shape once, then reuse it wherever that input matters.
 */
import { v } from 'convex/values'

import { defineArgs } from 'better-convex-nuxt/args'

export const createTodo = defineArgs({
  description: 'Create a personal todo',
  args: {
    title: v.string(),
  },
  meta: {
    title: {
      label: 'Title',
      description: 'A short description of something only this signed-in user should see',
      examples: ['Renew passport', 'Review onboarding copy'],
    },
  },
})
