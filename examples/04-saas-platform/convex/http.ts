/**
 * Why this file exists:
 * Better Auth registers its HTTP routes inside the Convex app here.
 */
import { httpRouter } from 'convex/server'

import { authComponent, createAuth } from './auth'

const http = httpRouter()

authComponent.registerRoutes(http, createAuth)

export default http
