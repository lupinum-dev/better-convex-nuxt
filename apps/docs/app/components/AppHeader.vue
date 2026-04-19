<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const { header } = useAppConfig()

const navItems = computed<NavigationMenuItem[]>(() => [
  {
    label: 'Get Started',
    to: '/apps/docs/getting-started',
    active: route.path === '/apps/docs/getting-started' || route.path.startsWith('/apps/docs/getting-started/'),
  },
  {
    label: 'Concepts',
    to: '/apps/docs/concepts',
    active: route.path === '/apps/docs/concepts' || route.path.startsWith('/apps/docs/concepts/'),
  },
  {
    label: 'Guides',
    to: '/apps/docs/guides',
    active:
      route.path.startsWith('/apps/docs/data-fetching') ||
      route.path.startsWith('/apps/docs/mutations') ||
      route.path.startsWith('/apps/docs/auth-security') ||
      route.path.startsWith('/apps/docs/file-uploads') ||
      route.path.startsWith('/apps/docs/server-side') ||
      route.path.startsWith('/apps/docs/permissions') ||
      route.path.startsWith('/apps/docs/mcp-tools') ||
      route.path === '/apps/docs/guides',
  },
  {
    label: 'Reference',
    to: '/apps/docs/reference',
    active:
      route.path === '/apps/docs/reference' ||
      route.path.startsWith('/apps/docs/api-reference') ||
      route.path.startsWith('/apps/docs/configuration') ||
      route.path.startsWith('/apps/docs/testing'),
  },
  {
    label: 'Examples',
    to: '/apps/docs/examples',
    active: route.path === '/apps/docs/examples',
  },
  {
    label: 'Project',
    to: '/apps/docs/project',
    active: route.path === '/apps/docs/project' || route.path.startsWith('/apps/docs/project/'),
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
