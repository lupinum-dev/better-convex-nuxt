export type SubjectKind = 'user' | 'agent' | 'service' | 'webhook' | 'system'

const subjectKinds = new Set<SubjectKind>(['user', 'agent', 'service', 'webhook', 'system'])

function parseCanonicalSubject(
  subject: unknown,
): { kind: SubjectKind; value: string } | null {
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

export function getSubjectValue(
  subject: unknown,
  expectedKind?: SubjectKind,
): string | null {
  const parsed = parseCanonicalSubject(subject)
  if (!parsed) return null
  if (expectedKind && parsed.kind !== expectedKind) return null
  return parsed.value
}

export function isSubjectKind(subject: unknown, kind: SubjectKind): boolean {
  return getSubjectKind(subject) === kind
}
