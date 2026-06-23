import { organizationClient } from 'better-auth/client/plugins'
import type { Ref } from 'vue'

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
      organizationClient({
        teams: {
          enabled: true,
        },
      }),
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
