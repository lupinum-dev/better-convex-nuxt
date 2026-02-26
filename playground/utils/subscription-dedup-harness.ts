import type { ConvexClient } from 'convex/browser'
import type { FunctionReference } from 'convex/server'

export interface SubscriptionDedupHarness {
  increment: () => void
  emitCurrent: () => void
  emitError: (message?: string) => void
  getCounter: () => number
  getListenerCount: (queryKey?: string) => number
}

declare global {
  interface Window {
    __subscriptionDedupBugFakeConvex?: SubscriptionDedupHarness
  }
}

export function getSubscriptionDedupHarness(): SubscriptionDedupHarness | undefined {
  if (!import.meta.client) return undefined
  return window.__subscriptionDedupBugFakeConvex
}

// Minimal fake query reference used by the playground repro pages.
export const subscriptionDedupCounterQuery = { _path: 'counter:get' } as unknown as FunctionReference<'query'>

export const emptyQueryArgs: Record<string, never> = {}

export type ConvexProvideValue = ConvexClient
