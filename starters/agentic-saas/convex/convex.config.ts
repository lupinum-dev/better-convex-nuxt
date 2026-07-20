import agent from '@convex-dev/agent/convex.config'
import { defineApp } from 'convex/server'

import betterAuth from './betterAuth/convex.config'

const app = defineApp()
app.use(agent)
app.use(betterAuth, { name: 'betterAuth' })

export default app
