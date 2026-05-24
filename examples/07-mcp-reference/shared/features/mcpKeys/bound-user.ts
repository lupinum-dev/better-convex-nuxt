export type McpBoundUser = {
  userId: string
  authKey: string
  displayName?: string | null
  email?: string | null
  role: string
}

export function selectMcpBoundUser(
  users: McpBoundUser[],
  boundUserId: string | null | undefined,
): McpBoundUser | null {
  const normalizedUserId = boundUserId?.trim()
  if (!normalizedUserId) return null

  return users.find((user) => user.userId === normalizedUserId) ?? null
}
