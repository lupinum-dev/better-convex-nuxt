export interface ComponentBridgeGeneratedFile {
  relativePath: string
  content: string
}

export interface ComponentBridgeManifest {
  packageName: string
  version: string
  renderFiles:
    | ComponentBridgeGeneratedFile[]
    | (() => ComponentBridgeGeneratedFile[] | Promise<ComponentBridgeGeneratedFile[]>)
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
    typeof manifest.renderFiles === 'function'
      ? await manifest.renderFiles()
      : manifest.renderFiles

  const files = [...rendered].sort((left, right) => left.relativePath.localeCompare(right.relativePath))
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
