<script setup lang="ts">
import { api } from '@@/convex/_generated/api'

definePageMeta({
  middleware: 'auth'
})

type FeedType = 'message' | 'task' | 'event'

// Reactive filter state - changing these will automatically re-run the query
const selectedType = ref<FeedType | undefined>(undefined)
const limit = ref(10)

// Computed args object - updates whenever selectedType or limit changes
const queryArgs = computed(() => ({
  type: selectedType.value,
  limit: limit.value
}))

// The query automatically re-subscribes when queryArgs changes
const { data: feedItems, status } = useConvexQuery(api.feed.listFiltered, queryArgs)

const typeOptions: Array<{ value: FeedType | undefined, label: string, icon: string }> = [
  { value: undefined, label: 'All Types', icon: 'i-lucide-list' },
  { value: 'message', label: 'Messages', icon: 'i-lucide-message-circle' },
  { value: 'task', label: 'Tasks', icon: 'i-lucide-check-square' },
  { value: 'event', label: 'Events', icon: 'i-lucide-calendar' }
]

const typeIcons: Record<string, string> = {
  message: 'i-lucide-message-circle',
  task: 'i-lucide-check-square',
  event: 'i-lucide-calendar'
}
</script>

<template>
  <div class="p-6 lg:p-8 max-w-2xl mx-auto">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold mb-2">Reactive Args</h1>
      <p class="text-muted">
        Watch queries automatically re-run when their arguments change.
      </p>
    </div>

    <!-- Explanation -->
    <UAlert
      class="mb-6"
      icon="i-lucide-info"
      color="secondary"
      variant="subtle"
      title="How it works"
      description="When you pass a reactive object (ref or computed) as query args, useConvexQuery automatically re-subscribes whenever the args change. No manual refetching needed!"
    />

    <!-- Filter Controls -->
    <UCard class="mb-6">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-filter" class="w-5 h-5 text-primary" />
          <span class="font-semibold">Filter Controls</span>
        </div>
      </template>

      <div class="space-y-4">
        <!-- Type Filter -->
        <div>
          <label class="text-sm font-medium mb-2 block">Filter by Type</label>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="option in typeOptions"
              :key="String(option.value)"
              :variant="selectedType === option.value ? 'solid' : 'outline'"
              :color="selectedType === option.value ? 'primary' : 'neutral'"
              size="sm"
              @click="selectedType = option.value"
            >
              <UIcon :name="option.icon" class="w-4 h-4 mr-1.5" />
              {{ option.label }}
            </UButton>
          </div>
        </div>

        <!-- Limit Control -->
        <div>
          <label class="text-sm font-medium mb-2 block">Results Limit</label>
          <div class="flex items-center gap-4">
            <URange
              v-model="limit"
              :min="5"
              :max="50"
              :step="5"
              class="flex-1"
            />
            <UBadge variant="subtle" color="neutral" class="min-w-12 justify-center">
              {{ limit }}
            </UBadge>
          </div>
        </div>

        <!-- Current Args Display -->
        <div class="pt-4 border-t border-default">
          <label class="text-sm font-medium mb-2 block">Current Query Args</label>
          <pre class="text-xs bg-elevated p-3 rounded-lg overflow-x-auto"><code>{{ JSON.stringify(queryArgs, null, 2) }}</code></pre>
        </div>
      </div>
    </UCard>

    <!-- Results -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-semibold">Feed Items</span>
          <div class="flex items-center gap-2">
            <UBadge
              v-if="status === 'pending'"
              color="primary"
              variant="subtle"
            >
              <UIcon name="i-lucide-loader-2" class="w-3 h-3 animate-spin mr-1" />
              Loading
            </UBadge>
            <UBadge variant="subtle" color="neutral">
              {{ feedItems?.length || 0 }} results
            </UBadge>
          </div>
        </div>
      </template>

      <!-- Loading state -->
      <div v-if="status === 'pending'" class="space-y-3">
        <USkeleton v-for="i in 3" :key="i" class="h-16 w-full" />
      </div>

      <!-- Empty state -->
      <div v-else-if="!feedItems?.length" class="text-center py-8">
        <UIcon name="i-lucide-inbox" class="w-12 h-12 text-muted mx-auto mb-4" />
        <p class="text-muted">No items match the current filter.</p>
        <p class="text-sm text-muted mt-1">
          Try selecting "All Types" or add some items in the
          <NuxtLink to="/demo/feed" class="text-primary hover:underline">Real-time Feed</NuxtLink> demo.
        </p>
      </div>

      <!-- Results list -->
      <div v-else class="space-y-3">
        <div
          v-for="item in feedItems"
          :key="item._id"
          class="flex gap-4 p-3 rounded-lg bg-elevated"
        >
          <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <UIcon :name="typeIcons[item.type]" class="w-5 h-5 text-primary" />
          </div>
          <div class="flex-1 min-w-0">
            <p>{{ item.content }}</p>
            <div class="flex items-center gap-2 mt-1">
              <UBadge size="xs" variant="subtle" color="neutral">
                {{ item.type }}
              </UBadge>
              <span class="text-xs text-muted">
                {{ item.authorName || 'Anonymous' }} &middot;
                {{ new Date(item.createdAt).toLocaleTimeString() }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Code Example -->
    <UCard class="mt-6">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-code" class="w-5 h-5" />
          <span class="font-semibold">Code Example</span>
        </div>
      </template>

      <pre class="text-xs bg-elevated p-4 rounded-lg overflow-x-auto"><code>// Reactive filter state
const selectedType = ref&lt;'message' | 'task' | undefined&gt;(undefined)
const limit = ref(10)

// Computed args object
const queryArgs = computed(() => ({
  type: selectedType.value,
  limit: limit.value
}))

// Query automatically re-runs when args change
const { data, status } = useConvexQuery(
  api.feed.listFiltered,
  queryArgs  // Pass computed or ref - both work!
)</code></pre>
    </UCard>
  </div>
</template>
