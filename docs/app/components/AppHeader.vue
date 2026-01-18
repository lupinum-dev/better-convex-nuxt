<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const { header } = useAppConfig()

const navItems = computed<NavigationMenuItem[]>(() => [
  {
    label: 'Getting Started',
    to: '/docs/guide/get-started',
    active: route.path.startsWith('/docs/guide')
  },
  {
    label: 'Data Fetching',
    to: '/docs/data-fetching/queries',
    active: route.path.startsWith('/docs/data-fetching')
  },
  {
    label: 'Mutations',
    to: '/docs/mutations/mutations',
    active: route.path.startsWith('/docs/mutations')
  },
  {
    label: 'Auth',
    to: '/docs/auth-security/authentication',
    active: route.path.startsWith('/docs/auth-security')
  },
  {
    label: 'Server-Side',
    to: '/docs/server-side/server-routes',
    active: route.path.startsWith('/docs/server-side')
  },
  {
    label: 'Advanced',
    to: '/docs/advanced/performance'
  }
])
</script>

<template>
  <UHeader
    :ui="{ center: 'flex-1' }"
    :to="header?.to || '/'"
  >
    <UNavigationMenu
      :items="navItems"
      variant="link"
      :ui="{
        link: 'text-highlighted hover:text-primary data-active:text-primary'
      }"
    />

    <template
      v-if="header?.logo?.dark || header?.logo?.light || header?.title"
      #title
    >
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

    <template
      v-else
      #left
    >
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
          <UContentSearchButton :label="null" />
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
      <UNavigationMenu
        :items="navItems"
        orientation="vertical"
        class="-mx-2.5 mb-4"
      />

      <UContentNavigation
        highlight
        :navigation="navigation"
      />
    </template>
  </UHeader>
</template>
