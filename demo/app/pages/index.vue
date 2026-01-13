<script setup lang="ts">
const router = useRouter()
const authClient = useAuthClient()
const { isAuthenticated } = useConvexAuth()

const isLoading = ref(false)

// Redirect to demo if already authenticated
watch(isAuthenticated, (authenticated) => {
  if (authenticated) {
    router.push('/demo')
  }
}, { immediate: true })

const providers = [{
  label: 'Continue with GitHub',
  icon: 'i-simple-icons-github',
  color: 'neutral' as const,
  onClick: async () => {
    if (!authClient) return
    isLoading.value = true
    try {
      await authClient.signIn.social({
        provider: 'github',
        callbackURL: '/demo'
      })
    } catch {
      isLoading.value = false
    }
  }
}]
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <UPageCard class="w-full max-w-sm">
      <UAuthForm
        title="Convex Demo"
        description="Sign in to explore real-time features"
        icon="i-lucide-flask-conical"
        :providers="providers"
        :loading="isLoading"
      >
        <template #footer>
          <p class="text-xs text-muted">
            Your GitHub profile will be used for display purposes only.
          </p>
        </template>
      </UAuthForm>
    </UPageCard>
  </div>
</template>
