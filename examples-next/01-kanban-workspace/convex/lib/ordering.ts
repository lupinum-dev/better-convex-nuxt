export const POSITION_STEP = 1000

export function moveIdBefore<T extends string>(
  ids: T[],
  movingId: T,
  beforeId?: T | null,
): T[] {
  const without = ids.filter((id) => id !== movingId)
  if (!beforeId) return [...without, movingId]

  const targetIndex = without.findIndex((id) => id === beforeId)
  if (targetIndex === -1) {
    throw new Error('Requested destination no longer exists.')
  }

  return [...without.slice(0, targetIndex), movingId, ...without.slice(targetIndex)]
}
