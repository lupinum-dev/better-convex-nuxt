import { httpRouter } from 'convex/server'

const http = httpRouter()
const authComponent = {
  registerRoutes(router: typeof http) {
    return router
  },
}

authComponent.registerRoutes(http)

export default http
