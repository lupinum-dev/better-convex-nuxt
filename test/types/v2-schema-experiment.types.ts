import { v } from 'convex/values'

import { defineSchema } from '../helpers/v2-schema-experiment'

defineSchema({
  args: {
    title: v.string(),
    content: v.string(),
  },
  meta: {
    title: { label: 'Title' },
    content: { label: 'Content' },
  },
})

defineSchema({
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
