import { betterAuth } from 'better-auth'

import { createAuthOptions } from '../auth'

export const auth = betterAuth(createAuthOptions({} as never))

