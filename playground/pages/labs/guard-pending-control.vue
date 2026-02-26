<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})

const convexPending = useState<boolean>('convex:pending', () => false)
const convexToken = useState<string | null>('convex:token', () => null)
const convexUser = useState<unknown>('convex:user', () => null)
const convexAuthError = useState<string | null>('convex:authError', () => null)
const isNavigating = ref(false)

async function triggerPendingProtectedNavigation() {
  if (import.meta.server) return

  // Force a pending auth state before navigation so the global auth middleware must wait.
  convexPending.value = true
  convexToken.value = null
  convexUser.value = null
  convexAuthError.value = null
  ;(window as Window & { __BCN_PENDING_GUARD_PROTECTED_MOUNTED__?: number })
    .__BCN_PENDING_GUARD_PROTECTED_MOUNTED__ = 0

  window.setTimeout(() => {
    convexPending.value = false
  }, 300)

  isNavigating.value = true
  await navigateTo('/labs/guard-pending-protected')
}
</script>

<template>
  <div class="container" data-testid="guard-pending-control-page">
    <h1>Guard Pending Control</h1>
    <p>Test harness for pending-auth route protection behavior.</p>
    <button data-testid="start-pending-guard-nav" :disabled="isNavigating" @click="triggerPendingProtectedNavigation">
      {{ isNavigating ? 'Navigating...' : 'Navigate to Protected Route With Pending Auth' }}
    </button>
  </div>
</template>
