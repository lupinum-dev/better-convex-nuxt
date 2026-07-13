export function isSameOrigin(origin: string, requestOrigin: string): boolean {
  try {
    return new URL(origin).origin === requestOrigin && origin === new URL(origin).origin
  } catch {
    return false
  }
}
