<script setup lang="ts">
definePageMeta({
  layout: 'auth'
})

const route = useRoute()
const router = useRouter()
const authClient = useAuthClient()
const { isAuthenticated } = useConvexAuth()

const isLoading = ref(false)
const error = ref<string | null>(null)

// Redirect to labs if already authenticated
watch(isAuthenticated, (authenticated) => {
  if (authenticated) {
    const redirect = (route.query.redirect as string) || '/labs'
    router.push(redirect)
  }
}, { immediate: true })

async function signInWithGitHub() {
  if (!authClient) {
    error.value = 'Auth client not available'
    return
  }

  isLoading.value = true
  error.value = null

  try {
    const callbackURL = (route.query.redirect as string) || '/labs'
    await authClient.signIn.social({
      provider: 'github',
      callbackURL
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to sign in'
    isLoading.value = false
  }
}
</script>

<template>
  <UCard class="w-full max-w-sm">
    <template #header>
      <div class="text-center">
        <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <UIcon name="i-lucide-flask-conical" class="w-6 h-6 text-primary" />
        </div>
        <h1 class="text-xl font-bold">Welcome to Convex Labs</h1>
        <p class="text-sm text-muted mt-1">
          Sign in to explore real-time features
        </p>
      </div>
    </template>

    <div class="space-y-4">
      <UAlert
        v-if="error"
        color="red"
        icon="i-lucide-alert-circle"
        :title="error"
        :close-button="{ icon: 'i-lucide-x', color: 'red', variant: 'link', onClick: () => error = null }"
      />

      <UButton
        block
        size="lg"
        color="neutral"
        variant="outline"
        icon="i-simple-icons-github"
        :loading="isLoading"
        @click="signInWithGitHub"
      >
        Continue with GitHub
      </UButton>
    </div>

    <template #footer>
      <p class="text-xs text-muted text-center">
        By signing in, you agree to our demo terms.
        <br />
        Your GitHub profile info will be used for display purposes only.
      </p>
    </template>
  </UCard>
</template>
