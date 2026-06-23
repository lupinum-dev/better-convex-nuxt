type ServerConvexQueryCall = {
  functionReference: unknown
  args: unknown
  options: unknown
}

export const serverConvexQueryCalls: ServerConvexQueryCall[] = []

let serverConvexQueryResult: unknown = {
  organizationId: 'org_from_convex',
  teamId: 'team_from_convex',
  canManageTeams: false,
}

export function setServerConvexQueryResult(result: unknown) {
  serverConvexQueryResult = result
}

export function resetServerConvexQueryMock() {
  serverConvexQueryCalls.length = 0
  serverConvexQueryResult = {
    organizationId: 'org_from_convex',
    teamId: 'team_from_convex',
    canManageTeams: false,
  }
}

export async function serverConvexQuery(
  _event: unknown,
  functionReference: unknown,
  args: unknown,
  options: unknown,
) {
  serverConvexQueryCalls.push({ functionReference, args, options })
  return serverConvexQueryResult
}
