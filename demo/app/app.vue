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

const siteUrl = useAppConfig().site?.url || process.env.SITE_URL || 'https://better-convex-nuxt-demo.vercel.app/'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  twitterCard: 'summary_large_image',
  ogImage: `${siteUrl}og-image.png`,
  twitterImage: `${siteUrl}og-image.png`,
  ogUrl: siteUrl
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
