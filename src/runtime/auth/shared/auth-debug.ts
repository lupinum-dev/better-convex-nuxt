export type WaterfallPhaseResult = 'hit' | 'miss' | 'success' | 'error' | 'skipped'

export interface AuthWaterfallPhase {
  name: string
  start: number
  end: number
  duration: number
  result: WaterfallPhaseResult
  details?: string
}

export interface AuthWaterfall {
  requestId: string
  timestamp: number
  phases: AuthWaterfallPhase[]
  totalDuration: number
  outcome: 'authenticated' | 'unauthenticated' | 'error'
  cacheHit: boolean
  error?: string
}
