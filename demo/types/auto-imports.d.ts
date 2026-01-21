import type { Ref } from 'vue'

declare global {
  const useAuthReady: () => Readonly<Ref<boolean>>
}

export {}
