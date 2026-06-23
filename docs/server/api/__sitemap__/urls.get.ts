import type { Collections } from '@nuxt/content'
import { queryCollection } from '@nuxt/content/server'

export default defineEventHandler(async (e) => {
  // Query all collections
  const [docsPages, landingPages] = await Promise.all([
    queryCollection(e, 'docs' as keyof Collections).all(),
    queryCollection(e, 'landing' as keyof Collections).all()
  ])

  const contentList = [...docsPages, ...landingPages]

  return contentList
    .filter((c) => {
      // Exclude pages that have sitemap: false
      if (c.sitemap === false) return false
      // Include all content pages
      return c.path
    })
    .map((c) => {
      const sitemapData = typeof c.sitemap === 'object' ? c.sitemap : {}

      return {
        loc: sitemapData.loc || c.path,
        lastmod: sitemapData.lastmod,
        changefreq: sitemapData.changefreq,
        priority: sitemapData.priority
      }
    })
})
