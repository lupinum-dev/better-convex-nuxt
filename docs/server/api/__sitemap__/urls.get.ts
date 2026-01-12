import { defineSitemapEventHandler, asSitemapUrl } from '#imports'
import { queryCollection } from '@nuxt/content/server'
import type { Collections } from '@nuxt/content'

export default defineSitemapEventHandler(async (e) => {
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
      return c._path
    })
    .map((c) => {
      const sitemapData = typeof c.sitemap === 'object' ? c.sitemap : {}

      return asSitemapUrl({
        loc: sitemapData.loc || c._path,
        lastmod: sitemapData.lastmod || c.updatedAt || c.createdAt,
        changefreq: sitemapData.changefreq,
        priority: sitemapData.priority
      })
    })
})
