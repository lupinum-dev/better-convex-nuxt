<script setup>
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

const title = 'Convex Demo'
const description = 'Interactive playground to experience better-convex-nuxt features in action. Real-time updates, optimistic mutations, pagination, and more.'

const siteUrl = ((useAppConfig().site?.url || process.env.SITE_URL || 'https://better-convex-nuxt-demo.vercel.app/').replace(/\/$/, '') + '/')
const ogImageUrl = `${siteUrl}og-image.png`

useSeoMeta({
  title,
  description,
  ogType: 'website',
  ogSiteName: 'Better Convex Nuxt',
  ogTitle: title,
  ogDescription: description,
  ogImage: ogImageUrl,
  ogImageWidth: '1200',
  ogImageHeight: '630',
  ogUrl: siteUrl,
  twitterCard: 'summary_large_image',
  twitterTitle: title,
  twitterDescription: description,
  twitterImage: ogImageUrl
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
