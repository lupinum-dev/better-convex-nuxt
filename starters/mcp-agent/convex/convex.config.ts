import rateLimiter from '@convex-dev/rate-limiter/convex.config'
import betterAuth from 'better-convex-nuxt/convex-auth/convex.config'
import { defineApp } from 'convex/server'

const app = defineApp()
app.use(betterAuth, { name: 'betterAuth' })
app.use(rateLimiter)

export default app
