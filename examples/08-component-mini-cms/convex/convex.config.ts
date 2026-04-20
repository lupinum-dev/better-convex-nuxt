import betterAuth from '@convex-dev/better-auth/convex.config'
import { defineApp } from 'convex/server'

import miniCms from './components/miniCms/convex.config.js'

const app = defineApp()

app.use(betterAuth, { name: 'betterAuth' })
app.use(miniCms, { name: 'miniCms' })

export default app
