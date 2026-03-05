<script setup lang="ts">
const { user, isAuthenticated, isPending, signOut: convexSignOut } = useConvexAuth()
const { user: permissionUser } = useDemoPermissions()
const router = useRouter()

// Get avatar URL from permission context (fetched from Convex, includes GitHub avatar)
const avatarUrl = computed(() => (permissionUser.value as any)?.avatarUrl)

const isSigningOut = ref(false)

async function signOut() {
  isSigningOut.value = true
  try {
    await convexSignOut()
    router.push('/')
  } finally {
    isSigningOut.value = false
  }
}

const items = computed(() => [
  [
    {
      label: user.value?.email || 'Unknown',
      slot: 'account',
      disabled: true,
    },
  ],
  [
    {
      label: 'Sign out',
      icon: 'i-lucide-log-out',
      onSelect: signOut,
    },
  ],
])
</script>

<template>
  <div v-if="isPending">
    <USkeleton class="w-8 h-8 rounded-full" />
  </div>

  <UDropdownMenu v-else-if="isAuthenticated && user" :items="items" :content="{ align: 'end' }">
    <UButton color="neutral" variant="ghost" class="p-0.5" :loading="isSigningOut">
      <UAvatar :src="avatarUrl" :alt="user.name || user.email || 'User'" size="sm" />
    </UButton>

    <template #account>
      <div class="flex items-center gap-2 px-1 py-1.5">
        <UAvatar :src="avatarUrl" :alt="user.name || user.email || 'User'" size="xs" />
        <div class="text-left">
          <p class="font-medium text-sm truncate">{{ user.name || 'User' }}</p>
          <p class="text-xs text-muted truncate">{{ user.email }}</p>
        </div>
      </div>
    </template>
  </UDropdownMenu>

  <UButton v-else to="/auth/signin" color="primary" variant="soft"> Sign in </UButton>
</template>
