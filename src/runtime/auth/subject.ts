export type SubjectKind = 'user' | 'auth' | 'agent' | 'service' | 'webhook' | 'system'
export type Subject<K extends SubjectKind = SubjectKind> = `${K}:${string}`
export type CanonicalSubject = Subject

const subjectKinds = new Set<SubjectKind>(['user', 'auth', 'agent', 'service', 'webhook', 'system'])

function parseCanonicalSubject(subject: unknown): { kind: SubjectKind; value: string } | null {
  if (typeof subject !== 'string') return null

  const separator = subject.indexOf(':')
  if (separator <= 0) return null

  const kind = subject.slice(0, separator)
  const value = subject.slice(separator + 1)
  if (!subjectKinds.has(kind as SubjectKind)) return null
  if (value.length === 0 || /\s/.test(value)) return null

  return {
    kind: kind as SubjectKind,
    value,
  }
}

export function getSubjectKind(subject: unknown): SubjectKind | null {
  return parseCanonicalSubject(subject)?.kind ?? null
}

export function getSubjectValue(subject: unknown, expectedKind?: SubjectKind): string | null {
  const parsed = parseCanonicalSubject(subject)
  if (!parsed) return null
  if (expectedKind && parsed.kind !== expectedKind) return null
  return parsed.value
}

export function isSubjectKind(subject: unknown, kind: SubjectKind): boolean {
  return getSubjectKind(subject) === kind
}

export function createSubject<K extends SubjectKind>(kind: K, value: string): Subject<K> {
  const normalizedValue = value.trim()
  const candidate = `${kind}:${normalizedValue}`
  const parsed = parseCanonicalSubject(candidate)

  if (!parsed || parsed.kind !== kind) {
    throw new Error(`Invalid canonical subject for kind "${kind}".`)
  }

  return candidate as Subject<K>
}

export const subject = {
  user: (value: string) => createSubject('user', value),
  auth: (value: string) => createSubject('auth', value),
  agent: (value: string) => createSubject('agent', value),
  service: (value: string) => createSubject('service', value),
  webhook: (value: string) => createSubject('webhook', value),
  system: (value: string) => createSubject('system', value),
  anonymous: (): 'system:anonymous' => 'system:anonymous',
} as const
