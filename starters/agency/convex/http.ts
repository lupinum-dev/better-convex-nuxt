import { httpRouter } from 'convex/server'

import { authComponent, createAuth } from './auth'

const http = httpRouter()

authComponent.registerRoutesLazy(http, createAuth)

export default http
