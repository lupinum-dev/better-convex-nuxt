<script setup lang="ts">
import { api } from '@@/convex/_generated/api'
import { ROLE_INFO, ROLES, type Role } from '@@/convex/permissions.config'

const { user, isLoading, isAuthenticated } = useDemoPermissions()
const { mutate: setRole, status: mutationStatus } = useConvexMutation(api.auth.setOwnRole)

const currentRole = computed(() => (user.value as { role?: Role } | null)?.role)
const isPending = computed(() => mutationStatus.value === 'pending')

async function selectRole(role: Role) {
  if (role === currentRole.value) return
  await setRole({ role })
}
</script>

<template>
  <div v-if="isAuthenticated && !isLoading" class="p-4 bg-default rounded-lg border border-default">
    <div class="flex items-center gap-2 mb-3">
      <UIcon name="i-lucide-users" class="w-4 h-4 text-muted" />
      <span class="text-xs font-semibold uppercase tracking-wider text-muted">
        Demo Role
      </span>
    </div>

    <p class="text-xs text-muted mb-3">
      Switch roles to see how permissions affect the UI
    </p>

    <div class="grid grid-cols-2 gap-2">
      <UButton
        v-for="role in ROLES"
        :key="role"
        :variant="currentRole === role ? 'solid' : 'outline'"
        :color="currentRole === role ? ROLE_INFO[role].color as any : 'neutral'"
        :loading="isPending"
        :disabled="isPending"
        size="sm"
        :class="[
          'justify-start relative',
          currentRole === role && 'font-medium'
        ]"
        @click="selectRole(role)"
      >
        <UIcon
          :name="ROLE_INFO[role].icon"
          class="shrink-0"
        />
        {{ ROLE_INFO[role].label }}
        <UIcon
          v-if="currentRole === role"
          name="i-lucide-check"
          class="ml-auto shrink-0 size-3.5 opacity-70"
        />
      </UButton>
    </div>

    <p v-if="currentRole" class="text-xs text-muted mt-3">
      {{ ROLE_INFO[currentRole].description }}
    </p>
  </div>

  <!-- Not authenticated state -->
  <div v-else-if="!isAuthenticated && !isLoading" class="p-4 bg-default rounded-lg border border-default">
    <p class="text-xs text-muted text-center">
      Sign in to try role switching
    </p>
  </div>
</template>
