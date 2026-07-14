import { computed, readonly, ref, watch } from 'vue'

export { computed, readonly, ref, watch }

export function useState<T>(_key: string, init?: () => T): { value: T } {
  return ref(init ? init() : undefined) as { value: T }
}

export function useNuxtApp(): Record<string, unknown> {
  return {}
}

export function useRuntimeConfig(): Record<string, unknown> {
  return { public: { convex: {} } }
}
