<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const { user, role } = useLabPermissions()

const labs = [
  {
    title: 'Real-time Feed',
    description: 'Watch live updates appear instantly across browser tabs using useConvexQuery.',
    icon: 'i-lucide-radio',
    to: '/labs/feed',
    color: 'green',
    features: ['Live subscriptions', 'Multi-tab sync', 'Auto-reconnect']
  },
  {
    title: 'Optimistic Updates',
    description: 'Compare standard mutations vs instant UI updates with optimistic rendering.',
    icon: 'i-lucide-zap',
    to: '/labs/optimistic',
    color: 'amber',
    features: ['Instant feedback', 'Rollback on error', 'Local state prediction']
  },
  {
    title: 'Pagination',
    description: 'Explore infinite scroll and load-more patterns with useConvexPaginatedQuery.',
    icon: 'i-lucide-list',
    to: '/labs/pagination',
    color: 'blue',
    features: ['Cursor pagination', 'Infinite scroll', 'Load more button']
  },
  {
    title: 'File Storage',
    description: 'Upload files with progress tracking using useConvexFileUpload.',
    icon: 'i-lucide-cloud-upload',
    to: '/labs/storage',
    color: 'purple',
    features: ['Progress tracking', 'Image preview', 'Storage URLs']
  }
]
</script>

<template>
  <div class="p-6 lg:p-8 max-w-5xl mx-auto">
    <!-- Welcome Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold mb-2">
        Welcome, {{ (user as any)?.displayName || 'Developer' }}!
      </h1>
      <p class="text-muted">
        You're logged in as <UBadge :color="role === 'owner' ? 'amber' : role === 'admin' ? 'blue' : role === 'member' ? 'green' : 'gray'" variant="subtle">{{ role }}</UBadge>.
        Use the role switcher in the sidebar to see how permissions affect the UI.
      </p>
    </div>

    <!-- Labs Grid -->
    <div class="grid gap-6 md:grid-cols-2">
      <NuxtLink
        v-for="lab in labs"
        :key="lab.to"
        :to="lab.to"
        class="group"
      >
        <UCard class="h-full transition-all hover:border-primary/50 hover:shadow-lg">
          <div class="flex items-start gap-4">
            <div
              :class="[
                'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
                `bg-${lab.color}-500/10`
              ]"
            >
              <UIcon
                :name="lab.icon"
                :class="['w-6 h-6', `text-${lab.color}-500`]"
              />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold group-hover:text-primary transition-colors">
                {{ lab.title }}
              </h3>
              <p class="text-sm text-muted mt-1">
                {{ lab.description }}
              </p>
              <div class="flex flex-wrap gap-2 mt-3">
                <UBadge
                  v-for="feature in lab.features"
                  :key="feature"
                  variant="subtle"
                  color="neutral"
                  size="sm"
                >
                  {{ feature }}
                </UBadge>
              </div>
            </div>
            <UIcon
              name="i-lucide-arrow-right"
              class="w-5 h-5 text-muted group-hover:text-primary group-hover:translate-x-1 transition-all"
            />
          </div>
        </UCard>
      </NuxtLink>
    </div>

    <!-- Tips Section -->
    <UCard class="mt-8">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-lightbulb" class="w-5 h-5 text-amber-500" />
          <span class="font-semibold">Quick Tips</span>
        </div>
      </template>

      <ul class="space-y-2 text-sm">
        <li class="flex items-start gap-2">
          <UIcon name="i-lucide-check" class="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
          <span>Open labs in multiple browser tabs to see real-time sync in action</span>
        </li>
        <li class="flex items-start gap-2">
          <UIcon name="i-lucide-check" class="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
          <span>Check the connection status indicator when testing offline scenarios</span>
        </li>
        <li class="flex items-start gap-2">
          <UIcon name="i-lucide-check" class="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
          <span>Switch roles to see how permissions affect what you can do</span>
        </li>
        <li class="flex items-start gap-2">
          <UIcon name="i-lucide-check" class="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
          <span>View the browser console for detailed logging output</span>
        </li>
      </ul>
    </UCard>
  </div>
</template>
