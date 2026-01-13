<script setup lang="ts">
const { isConnected, isReconnecting, connectionRetries } = useConvexConnectionState()
const config = useRuntimeConfig()
</script>

<template>
  <div class="p-4 bg-default rounded-lg border border-default">
    <div class="flex items-center gap-2 mb-2">
      <span class="relative flex h-2.5 w-2.5">
        <span
          v-if="isConnected"
          class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"
        />
        <span
          :class="[
            'relative inline-flex rounded-full h-2.5 w-2.5',
            isConnected ? 'bg-green-500' : isReconnecting ? 'bg-yellow-500' : 'bg-red-500'
          ]"
        />
      </span>
      <span class="text-xs font-medium uppercase tracking-wider text-muted">
        {{ isConnected ? 'Connected' : isReconnecting ? 'Reconnecting' : 'Disconnected' }}
      </span>
    </div>

    <p v-if="isReconnecting" class="text-xs text-muted mb-2">
      Attempt {{ connectionRetries }}...
    </p>

    <p class="text-[10px] text-muted font-mono truncate">
      {{ config.public.convex?.url || 'Not configured' }}
    </p>
  </div>
</template>
