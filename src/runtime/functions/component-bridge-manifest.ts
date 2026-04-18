export interface ComponentBridgeGeneratedFile {
  relativePath: string
  content: string
}

export interface ComponentBridgeManagedEdit {
  relativePath: string
  apply: (current: string | null) => string
}

export interface ComponentBridgeManifest {
  packageName: string
  version: string
  renderFiles:
    | ComponentBridgeGeneratedFile[]
    | (() => ComponentBridgeGeneratedFile[] | Promise<ComponentBridgeGeneratedFile[]>)
  managedEdits?:
    | ComponentBridgeManagedEdit[]
    | (() => ComponentBridgeManagedEdit[] | Promise<ComponentBridgeManagedEdit[]>)
}

export function defineComponentBridgeManifest<TManifest extends ComponentBridgeManifest>(
  manifest: TManifest,
): TManifest {
  return manifest
}

export async function renderComponentBridgeFiles(
  manifest: ComponentBridgeManifest,
): Promise<ComponentBridgeGeneratedFile[]> {
  const rendered =
    typeof manifest.renderFiles === 'function' ? await manifest.renderFiles() : manifest.renderFiles

  const files = [...rendered].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  )
  const seen = new Set<string>()
  for (const file of files) {
    if (seen.has(file.relativePath)) {
      throw new Error(
        `Bridge manifest for ${manifest.packageName} contains a duplicate file: ${file.relativePath}`,
      )
    }
    seen.add(file.relativePath)
  }
  return files
}

export async function renderComponentBridgeManagedEdits(
  manifest: ComponentBridgeManifest,
): Promise<ComponentBridgeManagedEdit[]> {
  const rendered =
    typeof manifest.managedEdits === 'function'
      ? await manifest.managedEdits()
      : (manifest.managedEdits ?? [])

  const edits = [...rendered].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  )
  const seen = new Set<string>()
  for (const edit of edits) {
    if (seen.has(edit.relativePath)) {
      throw new Error(
        `Bridge manifest for ${manifest.packageName} contains a duplicate managed edit: ${edit.relativePath}`,
      )
    }
    seen.add(edit.relativePath)
  }
  return edits
}

function trimLeadingBlankLines(value: string): string {
  return value.replace(/^\s*\n/, '')
}

export function renderComponentBridgeFile(
  manifest: Pick<ComponentBridgeManifest, 'packageName' | 'version'>,
  file: ComponentBridgeGeneratedFile,
): string {
  return [
    `// @trellis-bridge-package: ${manifest.packageName}`,
    `// @trellis-bridge-version: ${manifest.version}`,
    trimLeadingBlankLines(file.content),
  ].join('\n')
}

const legacyGinkoHeaderPattern = /^\/\/ @ginko-cms-version: .*\n/
const trellisMetadataPattern =
  /^\/\/ @trellis-bridge-package: .*\n\/\/ @trellis-bridge-version: .*\n/

export function stripComponentBridgeMetadata(content: string): string {
  return content.replace(trellisMetadataPattern, '').replace(legacyGinkoHeaderPattern, '')
}

export function ensureBridgeImport(source: string, importLine: string): string {
  if (source.includes(importLine)) return source

  const importMatches = [...source.matchAll(/^import .*$/gm)]
  if (importMatches.length === 0) {
    return `${importLine}\n${source}`
  }

  const lastImport = importMatches[importMatches.length - 1]
  const insertionPoint = (lastImport.index ?? 0) + lastImport[0].length
  return `${source.slice(0, insertionPoint)}\n${importLine}${source.slice(insertionPoint)}`
}

export function upsertBridgeManagedBlock(
  source: string,
  options: {
    packageName: string
    key: string
    content: string
    anchor: string | RegExp
    position?: 'before' | 'after'
  },
): string {
  const startMarker = `// @trellis-managed-start: ${options.packageName} ${options.key}`
  const endMarker = `// @trellis-managed-end: ${options.packageName} ${options.key}`
  const trimmedContent = options.content.trim()
  const block = `${startMarker}\n${trimmedContent}\n${endMarker}`
  const existingBlockPattern = new RegExp(
    `${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}`,
  )

  if (existingBlockPattern.test(source)) {
    return source.replace(existingBlockPattern, block)
  }

  if (typeof options.anchor === 'string') {
    const stringAnchorIndex = source.indexOf(options.anchor)
    if (stringAnchorIndex < 0) {
      throw new Error(
        `Could not find insertion anchor for managed bridge block "${options.key}".`,
      )
    }
    const insertionPoint =
      (options.position ?? 'after') === 'before'
        ? stringAnchorIndex
        : stringAnchorIndex + options.anchor.length
    const prefix = source.slice(0, insertionPoint).replace(/\s*$/, '')
    const suffix = source.slice(insertionPoint).replace(/^\s*/, '')

    return `${prefix}\n\n${block}\n\n${suffix}`.trimEnd()
  }

  const regexAnchorMatch = options.anchor.exec(source)
  if (!regexAnchorMatch) {
    throw new Error(
      `Could not find insertion anchor for managed bridge block "${options.key}".`,
    )
  }
  const insertionPoint =
    (options.position ?? 'after') === 'before'
      ? (regexAnchorMatch.index ?? 0)
      : (regexAnchorMatch.index ?? 0) + regexAnchorMatch[0].length
  const prefix = source.slice(0, insertionPoint).replace(/\s*$/, '')
  const suffix = source.slice(insertionPoint).replace(/^\s*/, '')

  return `${prefix}\n\n${block}\n\n${suffix}`.trimEnd()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
