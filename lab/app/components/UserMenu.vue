<script setup lang="ts">
const { user, isAuthenticated, isPending } = useConvexAuth()
const authClient = useAuthClient()
const router = useRouter()

const isSigningOut = ref(false)

async function signOut() {
  if (!authClient) return

  isSigningOut.value = true
  try {
    await authClient.signOut()
    router.push('/')
  } finally {
    isSigningOut.value = false
  }
}

const items = computed(() => [
  [{
    label: user.value?.email || 'Unknown',
    slot: 'account',
    disabled: true
  }],
  [{
    label: 'Sign out',
    icon: 'i-lucide-log-out',
    click: signOut
  }]
])
</script>

<template>
  <div v-if="isPending">
    <USkeleton class="w-8 h-8 rounded-full" />
  </div>

  <UDropdownMenu
    v-else-if="isAuthenticated && user"
    :items="items"
    :content="{ align: 'end' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      class="p-0.5"
      :loading="isSigningOut"
    >
      <UAvatar
        :src="user.image"
        :alt="user.name || user.email || 'User'"
        size="sm"
      />
    </UButton>

    <template #account>
      <div class="flex items-center gap-2 px-1 py-1.5">
        <UAvatar
          :src="user.image"
          :alt="user.name || user.email || 'User'"
          size="xs"
        />
        <div class="text-left">
          <p class="font-medium text-sm truncate">{{ user.name || 'User' }}</p>
          <p class="text-xs text-muted truncate">{{ user.email }}</p>
        </div>
      </div>
    </template>
  </UDropdownMenu>

  <UButton
    v-else
    to="/auth/signin"
    color="primary"
    variant="soft"
  >
    Sign in
  </UButton>
</template>
