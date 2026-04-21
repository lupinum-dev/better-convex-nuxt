import { createRedisMcpRateLimitStore } from '#trellis/mcp'

type RedisEvalResult = number | string | null
type RedisEvalClient = {
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<RedisEvalResult>
}

let redisClientPromise: Promise<RedisEvalClient> | undefined

async function getRedisClient(): Promise<RedisEvalClient> {
  const redisUrl = process.env.MCP_RATE_LIMIT_REDIS_URL?.trim()
  if (!redisUrl) {
    throw new Error(
      'Set MCP_RATE_LIMIT_REDIS_URL to a Redis connection string before using rate-limited MCP tools.',
    )
  }

  if (!redisClientPromise) {
    redisClientPromise = import('ioredis').then(({ default: Redis }) => {
      const redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectionName: 'trellis-example-07-mcp-rate-limit',
      })

      return {
        eval: async (script, numKeys, ...args) => {
          const result = await redis.eval(script, numKeys, ...args)
          return result as RedisEvalResult
        },
      }
    })
  }

  return await redisClientPromise
}

export const mcpRateLimitStore = createRedisMcpRateLimitStore({
  client: {
    eval: async (script, numKeys, ...args) => {
      const client = await getRedisClient()
      return await client.eval(script, numKeys, ...args)
    },
  },
  keyPrefix: 'trellis:examples:07-mcp-reference',
})
