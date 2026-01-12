import { defineContentConfig, defineCollection, z } from '@nuxt/content'

const docsSchema = z.object({
  links: z
    .array(
      z.object({
        label: z.string(),
        icon: z.string(),
        to: z.string(),
        target: z.string().optional()
      })
    )
    .optional(),
  sitemap: z
    .object({
      loc: z.string().optional(),
      lastmod: z.union([z.string(), z.date()]).optional(),
      changefreq: z
        .enum(['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'])
        .optional(),
      priority: z.number().min(0).max(1).optional()
    })
    .optional()
})

export default defineContentConfig({
  collections: {
    landing: defineCollection({
      type: 'page',
      source: 'index.md'
    }),
    docs: defineCollection({
      type: 'page',
      source: {
        include: 'docs/**'
      },
      schema: docsSchema
    })
  }
})
