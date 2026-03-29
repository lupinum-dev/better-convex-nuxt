export interface StoredMcpSecret {
  key: string
  name?: string
  role?: string
  prefix?: string
  updatedAt: number
}

type StoredMcpSecrets = Record<string, StoredMcpSecret>

const STORAGE_KEY = 'better-convex-nuxt:playground:mcp-secrets'

function parseStoredSecrets(raw: string | null): StoredMcpSecrets {
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, StoredMcpSecret] => {
          const value = entry[1] as Partial<StoredMcpSecret> | undefined
          return Boolean(
            value
            && typeof value === 'object'
            && typeof value.key === 'string'
            && typeof value.updatedAt === 'number',
          )
        }),
    )
  }
  catch {
    return {}
  }
}

export function useStoredMcpSecrets() {
  const secrets = useState<StoredMcpSecrets>('playground-mcp-secrets', () => ({}))
  const hydrated = useState<boolean>('playground-mcp-secrets-hydrated', () => false)

  const persist = () => {
    if (!import.meta.client) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(secrets.value))
  }

  if (import.meta.client && !hydrated.value) {
    secrets.value = parseStoredSecrets(localStorage.getItem(STORAGE_KEY))
    hydrated.value = true
  }

  const rememberSecret = (
    id: string,
    value: {
      key: string
      name?: string
      role?: string
      prefix?: string
    },
  ) => {
    secrets.value = {
      ...secrets.value,
      [id]: {
        key: value.key,
        ...(value.name ? { name: value.name } : {}),
        ...(value.role ? { role: value.role } : {}),
        ...(value.prefix ? { prefix: value.prefix } : {}),
        updatedAt: Date.now(),
      },
    }
    persist()
  }

  const forgetSecret = (id: string) => {
    const { [id]: _removed, ...rest } = secrets.value
    secrets.value = rest
    persist()
  }

  const getSecret = (id: string | null | undefined) => {
    if (!id) return null
    return secrets.value[id] ?? null
  }

  const hasSecret = (id: string | null | undefined) => {
    return Boolean(getSecret(id))
  }

  return {
    secrets,
    rememberSecret,
    forgetSecret,
    getSecret,
    hasSecret,
  }
}
