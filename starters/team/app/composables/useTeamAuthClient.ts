import { apiKeyClient } from '@better-auth/api-key/client'
import { passkeyClient } from '@better-auth/passkey/client'
import { scimClient } from '@better-auth/scim/client'
import {
  adminClient,
  emailOTPClient,
  inferAdditionalFields,
  magicLinkClient,
  organizationClient,
  twoFactorClient,
} from 'better-auth/client/plugins'
import type { Ref } from 'vue'

import type { AppAuth } from '../../convex/auth'

let teamAuthClient: ReturnType<typeof createTeamAuthClient> | undefined

export type TeamOrganization = {
  id: string
  name: string
  role?: string | null
}

type TeamOrganizationListState = {
  data: TeamOrganization[] | null
  error: unknown
  isPending: boolean
  isRefetching: boolean
  refetch: () => Promise<void>
}

type TeamAuthClientWithOrganizations = TeamAuthClient & {
  useListOrganizations: () => Readonly<Ref<TeamOrganizationListState>>
}

function resolveServerAuthBaseURL() {
  if (import.meta.client) return undefined

  const config = useRuntimeConfig()
  const publicConvex = config.public?.convex as { authRoute?: unknown } | undefined
  const rawAuthRoute =
    typeof publicConvex?.authRoute === 'string' ? publicConvex.authRoute : '/api/auth'
  const authRoute = rawAuthRoute.startsWith('/') ? rawAuthRoute : `/${rawAuthRoute}`

  return `${useRequestURL().origin}${authRoute}`
}

function createTeamAuthClient(baseURL?: string) {
  return createBetterConvexAuthClient({
    baseURL,
    plugins: [
      inferAdditionalFields<AppAuth>(),
      organizationClient({
        dynamicAccessControl: {
          enabled: true,
        },
        teams: {
          enabled: true,
        },
        schema: {
          member: {
            additionalFields: {
              title: {
                type: 'string',
                required: false,
              },
              department: {
                type: 'string',
                required: false,
              },
              billable: {
                type: 'boolean',
                required: false,
              },
            },
          },
        },
      }),
      adminClient(),
      apiKeyClient(),
      scimClient(),
      passkeyClient(),
      twoFactorClient(),
      emailOTPClient(),
      magicLinkClient(),
    ] as const,
  })
}

export function useTeamAuthClient() {
  if (import.meta.server) {
    return createTeamAuthClient(resolveServerAuthBaseURL())
  }

  teamAuthClient ??= createTeamAuthClient()
  return teamAuthClient
}

export type TeamAuthClient = ReturnType<typeof useTeamAuthClient>

export function useTeamOrganizations() {
  return (useTeamAuthClient() as TeamAuthClientWithOrganizations).useListOrganizations()
}
