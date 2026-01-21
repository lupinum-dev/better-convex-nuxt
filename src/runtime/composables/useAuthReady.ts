import { useState, readonly } from '#imports'

export function useAuthReady() {
  const authReady = useState<boolean>('convex:authReady', () => false)

  return readonly(authReady)
}
