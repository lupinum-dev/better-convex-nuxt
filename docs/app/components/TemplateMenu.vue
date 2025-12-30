<template>
  <UDropdownMenu
    v-slot="{ open }"
    :modal="false"
    :items="[{
      label: 'Convex',
      to: 'https://convex.dev',
      icon: 'i-lucide-database',
    }, {
      label: 'Better Auth',
      to: 'https://www.better-auth.com',
      icon: 'i-lucide-shield',
    }, {
      label: 'Convex Better Auth',
      to: 'https://labs.convex.dev/better-auth',
      icon: 'i-lucide-plug',
    }]"
    :content="{ align: 'start' }"
    :ui="{ content: 'min-w-fit' }"
    size="xs"
  >
    <UButton
      label="Resources"
      variant="subtle"
      trailing-icon="i-lucide-chevron-down"
      size="xs"
      class="-mb-[6px] font-semibold rounded-full truncate"
      :class="[open && 'bg-primary/15']"
      :ui="{
        trailingIcon: ['transition-transform duration-200', open ? 'rotate-180' : undefined].filter(Boolean).join(' '),
      }"
    />
  </UDropdownMenu>
</template>
