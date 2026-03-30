/**
 * Why this file exists:
 * Better Auth exposes HTTP routes such as `/api/auth/sign-in/email`.
 * Convex serves those routes through its HTTP router.
 */
import { httpRouter } from 'convex/server'

import { authComponent, createAuth } from './auth'

const http = httpRouter()

authComponent.registerRoutes(http, createAuth)

export default http
