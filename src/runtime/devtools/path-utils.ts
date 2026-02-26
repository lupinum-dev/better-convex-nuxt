import { join, relative, resolve, sep } from 'node:path'

export function resolveDevtoolsFilePath(outputDir: string, pathname: string): string {
  const outputDirResolved = resolve(outputDir)
  return resolve(join(outputDirResolved, pathname))
}

export function isPathInsideDirectory(rootDir: string, filePath: string): boolean {
  const rootResolved = resolve(rootDir)
  const fileResolved = resolve(filePath)
  const rel = relative(rootResolved, fileResolved)
  if (!rel) return false
  return !rel.startsWith('..') && !rel.includes(`${sep}..`)
}
