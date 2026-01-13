<script lang="ts" setup>
const stack = [
{
    name: 'Better Auth',
    iconLight: '/icons/better-auth-logo-light.svg',
    iconDark: '/icons/better-auth-logo-dark.svg',
    role: 'Authentication'
  },
  {
    name: 'Convex',
    icon: '/icons/convex.svg',
    role: 'Reactive Backend'
  },

  {
    name: 'Nuxt',
    icon: '/icons/nuxt.svg',
    role: 'Vue Framework'
  }
]
</script>

<template>
  <div class="py-16 xl:py-24 not-prose">
    <!-- Section Header -->
    <div class="text-center mb-12 xl:mb-16">
      <h2 class="text-3xl xl:text-4xl font-bold text-highlighted mb-3">
        Powered by the Modern Stack
      </h2>
      <p class="text-lg text-muted max-w-xl mx-auto">
        Three technologies, seamlessly integrated
      </p>
    </div>

    <!-- Stack -->
    <div class="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12">
      <div
        v-for="item in stack"
        :key="item.name"
        class="flex flex-col items-center group"
      >
        <div
          class="p-1 rounded-2xl ring-2 ring-black/10 dark:ring-white/15 transition-all duration-300 group-hover:scale-105 group-hover:ring-black/20 dark:group-hover:ring-white/30"
        >
          <div
            class="bg-white dark:bg-neutral-900 p-8 rounded-xl flex items-center justify-center border border-neutral-200 dark:border-neutral-800"
          >
            <!-- Single icon -->
            <img
              v-if="item.icon"
              :src="item.icon"
              :alt="item.name"
              class="size-16"
            >
            <!-- Dark/Light mode icons for Better Auth -->
            <template v-else>
              <img
                :src="item.iconLight"
                :alt="item.name"
                class="size-16 dark:hidden"
              >
              <img
                :src="item.iconDark"
                :alt="item.name"
                class="size-16 hidden dark:block"
              >
            </template>
          </div>
        </div>
        <h3 class="mt-4 text-lg font-semibold text-highlighted">
          {{ item.name }}
        </h3>
        <p class="text-sm text-muted">
          {{ item.role }}
        </p>
      </div>
    </div>
  </div>
</template>
