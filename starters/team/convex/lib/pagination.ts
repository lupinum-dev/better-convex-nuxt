import { ConvexError } from 'convex/values'

export const maxPageSize = 50

export function requireBoundedPageSize(numItems: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > maxPageSize) {
    throw new ConvexError(`Page size must be an integer from 1 to ${maxPageSize}`)
  }
}
