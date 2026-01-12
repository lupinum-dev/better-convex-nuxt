<script setup lang="ts">
const { seo } = useAppConfig()

const { data: navigation } = await useAsyncData('navigation', () =>
  queryCollectionNavigation('docs')
)
const { data: files } = useLazyAsyncData(
  'search',
  () => queryCollectionSearchSections('docs'),
  {
    server: false
  }
)

useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [{ rel: 'icon', href: '/favicon.ico' }],
  htmlAttrs: {
    lang: 'en'
  }
})

useSeoMeta({
  titleTemplate: `%s - ${seo?.siteName}`,
  ogSiteName: seo?.siteName,
  twitterCard: 'summary_large_image'
})

const navigationChildren = computed(() => navigation.value?.[0]?.children || [])
provide('navigation', navigationChildren)
</script>

<template>
  <UApp class="">
    <UBanner
      id="early-version-warning"
      class="bg-convex-purple-500 hover:bg-convex-purple-600"
      title="Early Version - Not Production Ready"
      icon="i-lucide-flask-conical"
      close
      :ui="{
        title: 'text-white!',
        icon: 'text-white!'
      }"
    />

    <NuxtLoadingIndicator />

    <AppHeader />

    <UMain>
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </UMain>

    <AppFooter />

    <ClientOnly>
      <LazyUContentSearch
        :files="files"
        :navigation="navigation"
      />
    </ClientOnly>
  </UApp>
</template>
