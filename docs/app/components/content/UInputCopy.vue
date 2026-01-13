<script setup lang="ts">
const props = withDefaults(defineProps<{
  value: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}>(), {
  size: 'lg'
})

const { copy, copied } = useClipboard()
</script>

<template>
  <label>
    <UInput
      :model-value="value"
      :size="size"
      disabled
      :ui="{ 
        base: 'disabled:cursor-default',
        trailing: 'pe-1' 
      }"
    >
      <template #trailing>
        <UButton
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          color="neutral"
          variant="link"
          :padded="false"
          :ui="{ leadingIcon: 'size-4' }"
          :class="{
            'text-green-500 hover:text-green-500 dark:text-green-400 hover:dark:text-green-400':
              copied
          }"
          aria-label="copy button"
          @click="copy(value)"
        />
      </template>
    </UInput>
  </label>
</template>
