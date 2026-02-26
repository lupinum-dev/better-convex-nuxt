import { computed, readonly, ref, watch } from 'vue'

export { computed, readonly, watch }

export function useState<T>(_key: string, init?: () => T): { value: T } {
  return ref(init ? init() : undefined) as { value: T }
}

export function useNuxtApp(): Record<string, unknown> {
  return {}
}

