export type McpBoundUser = {
  authId: string
  displayName?: string | null
  email?: string | null
  role: string
}

export function selectMcpBoundUser(
  users: McpBoundUser[],
  boundAuthId: string | null | undefined,
): McpBoundUser | null {
  const normalizedAuthId = boundAuthId?.trim()
  if (!normalizedAuthId) return null

  return users.find((user) => user.authId === normalizedAuthId) ?? null
}
