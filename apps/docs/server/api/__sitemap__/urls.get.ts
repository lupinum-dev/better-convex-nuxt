import { queryCollection } from '@nuxt/content/server'
import type { H3Event } from 'h3'
import { defineEventHandler } from 'h3'

type SitemapMeta = {
  loc?: string
  lastmod?: string | Date
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
}

type ContentPage = {
  path?: string
  sitemap?: false | SitemapMeta
}

async function readPages(event: H3Event, collection: 'docs' | 'landing'): Promise<ContentPage[]> {
  return (await queryCollection(event, collection).all()) as ContentPage[]
}

export default defineEventHandler(async (event) => {
  const [docsPages, landingPages] = await Promise.all([
    readPages(event, 'docs'),
    readPages(event, 'landing'),
  ])

  return [...docsPages, ...landingPages]
    .filter((page) => page.sitemap !== false && page.path)
    .map((page) => {
      const sitemap = typeof page.sitemap === 'object' ? page.sitemap : {}

      return {
        loc: sitemap.loc ?? page.path,
        ...(sitemap.lastmod ? { lastmod: sitemap.lastmod } : {}),
        ...(sitemap.changefreq ? { changefreq: sitemap.changefreq } : {}),
        ...(typeof sitemap.priority === 'number' ? { priority: sitemap.priority } : {}),
      }
    })
})
