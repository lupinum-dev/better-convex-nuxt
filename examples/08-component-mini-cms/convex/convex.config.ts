import betterAuth from '@convex-dev/better-auth/convex.config'
import { defineApp } from 'convex/server'

// eslint-disable-next-line @lupinum/trellis/convex-no-nuxt-imports
import miniCms from './components/miniCms/convex.config.js'

const app = defineApp()

app.use(betterAuth, { name: 'betterAuth' })
app.use(miniCms, { name: 'miniCms' })

export default app
