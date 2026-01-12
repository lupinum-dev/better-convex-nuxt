<script setup lang="ts">
const route = useRoute()

const navigation = [
  {
    label: 'Labs',
    icon: 'i-lucide-flask-conical',
    children: [
      { label: 'Overview', to: '/labs', icon: 'i-lucide-layout-dashboard' },
      { label: 'Real-time Feed', to: '/labs/feed', icon: 'i-lucide-radio' },
      { label: 'Optimistic Updates', to: '/labs/optimistic', icon: 'i-lucide-zap' },
      { label: 'Pagination', to: '/labs/pagination', icon: 'i-lucide-list' },
      { label: 'File Storage', to: '/labs/storage', icon: 'i-lucide-cloud-upload' }
    ]
  }
]

// Check if current route is in labs section
const isLabsRoute = computed(() => route.path.startsWith('/labs'))
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Header -->
    <UHeader>
      <template #left>
        <NuxtLink to="/" class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <UIcon name="i-lucide-flask-conical" class="w-5 h-5 text-white" />
          </div>
          <span class="font-bold text-lg">Convex Labs</span>
        </NuxtLink>
      </template>

      <template #right>
        <UColorModeButton />
        <UserMenu v-if="isLabsRoute" />
        <UButton
          v-else
          to="/labs"
          color="primary"
          variant="soft"
        >
          Enter Labs
        </UButton>
      </template>
    </UHeader>

    <!-- Main content area -->
    <div class="flex-1 flex">
      <!-- Sidebar - only show in labs section -->
      <aside
        v-if="isLabsRoute"
        class="w-64 border-r border-default bg-elevated hidden lg:block"
      >
        <div class="p-4 space-y-6">
          <!-- Navigation -->
          <nav class="space-y-1">
            <template v-for="group in navigation" :key="group.label">
              <div class="text-xs font-semibold text-muted uppercase tracking-wider px-3 py-2">
                {{ group.label }}
              </div>
              <NuxtLink
                v-for="item in group.children"
                :key="item.to"
                :to="item.to"
                class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
                :class="[
                  route.path === item.to
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted hover:text-default hover:bg-elevated'
                ]"
              >
                <UIcon :name="item.icon" class="w-4 h-4" />
                {{ item.label }}
              </NuxtLink>
            </template>
          </nav>

          <!-- Connection Status -->
          <ConnectionStatus />

          <!-- Role Switcher -->
          <RoleSwitcher />
        </div>
      </aside>

      <!-- Page content -->
      <main class="flex-1">
        <slot />
      </main>
    </div>

    <!-- Footer - only on landing page -->
    <UFooter v-if="!isLabsRoute">
      <template #left>
        <p class="text-sm text-muted">
          Built with better-convex-nuxt
        </p>
      </template>
      <template #right>
        <UButton
          to="https://github.com/lupinum-dev/better-convex-nuxt"
          target="_blank"
          icon="i-simple-icons-github"
          aria-label="GitHub"
          color="neutral"
          variant="ghost"
        />
      </template>
    </UFooter>
  </div>
</template>
