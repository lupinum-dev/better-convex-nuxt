import { v } from 'convex/values'

import { defineArgs } from '../helpers/v2-schema-experiment'

defineArgs({
  args: {
    title: v.string(),
    content: v.string(),
  },
  meta: {
    title: { label: 'Title' },
    content: { label: 'Content' },
  },
})

defineArgs({
  args: {
    title: v.string(),
    content: v.string(),
  },
  meta: {
    title: { label: 'Title' },
    // @ts-expect-error Extra keys must match args keys.
    summary: { label: 'Summary' },
  },
})
