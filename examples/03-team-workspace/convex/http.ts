/**
 * Why this file exists:
 * Better Auth needs its HTTP endpoints registered inside the Convex app.
 */
import { httpRouter } from 'convex/server'

import { authComponent, createAuth } from './auth'

const http = httpRouter()

authComponent.registerRoutes(http, createAuth)

export default http
