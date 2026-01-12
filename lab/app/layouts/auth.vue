<script setup lang="ts">
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Simple header for auth pages -->
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
      </template>
    </UHeader>

    <!-- Centered content -->
    <main class="flex-1 flex items-center justify-center p-4">
      <slot />
    </main>
  </div>
</template>
