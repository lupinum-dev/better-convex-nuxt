<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const { header } = useAppConfig()

const navItems = computed<NavigationMenuItem[]>(() => [
  {
    label: 'Get Started',
    to: '/docs/getting-started',
    active:
      route.path === '/docs/getting-started' || route.path.startsWith('/docs/getting-started/'),
  },
  {
    label: 'Concepts',
    to: '/docs/concepts',
    active: route.path === '/docs/concepts' || route.path.startsWith('/docs/concepts/'),
  },
  {
    label: 'Guides',
    to: '/docs/guides',
    active:
      route.path.startsWith('/docs/data-fetching') ||
      route.path.startsWith('/docs/mutations') ||
      route.path.startsWith('/docs/auth-security') ||
      route.path.startsWith('/docs/file-uploads') ||
      route.path.startsWith('/docs/server-side') ||
      route.path.startsWith('/docs/permissions') ||
      route.path.startsWith('/docs/mcp-tools') ||
      route.path === '/docs/guides',
  },
  {
    label: 'Reference',
    to: '/docs/reference',
    active:
      route.path === '/docs/reference' ||
      route.path.startsWith('/docs/api-reference') ||
      route.path.startsWith('/docs/configuration') ||
      route.path.startsWith('/docs/testing'),
  },
  {
    label: 'Examples',
    to: '/docs/examples',
    active: route.path === '/docs/examples',
  },
  {
    label: 'Project',
    to: '/docs/project',
    active: route.path === '/docs/project' || route.path.startsWith('/docs/project/'),
  },
])
</script>

<template>
  <UHeader :ui="{ center: 'flex-1' }" :to="header?.to || '/'">
    <UNavigationMenu
      :items="navItems"
      variant="link"
      :ui="{
        link: 'text-highlighted hover:text-primary data-active:text-primary',
      }"
    />

    <template v-if="header?.logo?.dark || header?.logo?.light || header?.title" #title>
      <UColorModeImage
        v-if="header?.logo?.dark || header?.logo?.light"
        :light="header?.logo?.light!"
        :dark="header?.logo?.dark!"
        :alt="header?.logo?.alt"
        class="h-6 w-auto shrink-0"
      />

      <span v-else-if="header?.title">
        {{ header.title }}
      </span>
    </template>

    <template v-else #left>
      <NuxtLink :to="header?.to || '/'">
        <AppLogo class="w-auto h-6 shrink-0" />
      </NuxtLink>

      <TemplateMenu />
    </template>

    <template #right>
      <div class="flex items-center gap-2">
        <UTooltip
          v-if="header?.search"
          text="Search"
          :kbds="['meta', 'K']"
          :popper="{ strategy: 'absolute' }"
        >
          <UContentSearchButton />
        </UTooltip>

        <UColorModeButton v-if="header?.colorMode" />

        <template v-if="header?.links">
          <UButton
            v-for="(link, index) of header.links"
            :key="index"
            v-bind="{ color: 'neutral', variant: 'ghost', ...link }"
          />
        </template>
      </div>
    </template>

    <template #body>
      <UNavigationMenu :items="navItems" orientation="vertical" class="-mx-2.5 mb-4" />

      <UContentNavigation highlight :navigation="navigation" />
    </template>
  </UHeader>
</template>
