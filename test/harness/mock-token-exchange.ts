import { mintJwt, type JwtPayload } from './jwt-factory'

export interface TokenExchangeResponse {
  data: { token: string } | null
  error: Error | null
  delayMs?: number
}

export interface MockTokenExchange {
  respondWithToken(token: string): void
  respondWithPayload(payload: JwtPayload): void
  respondWithMiss(): void
  respondWithError(error: Error | string): void
  enqueue(...responses: TokenExchangeResponse[]): void
  getNextResponse(): Promise<TokenExchangeResponse>
  readonly callCount: number
  reset(): void
}

function normalizeError(error: Error | string): Error {
  return typeof error === 'string' ? new Error(error) : error
}

export function createMockTokenExchange(): MockTokenExchange {
  let defaultResponse: TokenExchangeResponse = {
    data: null,
    error: null,
  }
  const queue: TokenExchangeResponse[] = []
  let _callCount = 0

  return {
    respondWithToken(token) {
      defaultResponse = { data: { token }, error: null }
    },
    respondWithPayload(payload) {
      defaultResponse = { data: { token: mintJwt(payload) }, error: null }
    },
    respondWithMiss() {
      defaultResponse = { data: null, error: null }
    },
    respondWithError(error) {
      defaultResponse = { data: null, error: normalizeError(error) }
    },
    enqueue(...responses) {
      queue.push(...responses)
    },
    async getNextResponse() {
      _callCount++
      const response = queue.length > 0 ? queue.shift()! : { ...defaultResponse }
      if (response.delayMs && response.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, response.delayMs))
      }
      return {
        data: response.data ? { ...response.data } : null,
        error: response.error ? new Error(response.error.message) : null,
      }
    },
    get callCount() {
      return _callCount
    },
    reset() {
      defaultResponse = { data: null, error: null }
      queue.length = 0
      _callCount = 0
    },
  }
}
