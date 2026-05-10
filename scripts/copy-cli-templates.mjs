import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const deletedLegacyDirs = [
  resolve(rootDir, 'dist/templates'),
  resolve(rootDir, 'dist/cli/templates'),
]
const copyPairs = [
  {
    sourceDir: resolve(rootDir, 'src/cli/starter-fixtures'),
    destDirs: [
      resolve(rootDir, 'dist/starter-fixtures'),
      resolve(rootDir, 'dist/cli/starter-fixtures'),
    ],
  },
  {
    sourceDir: resolve(rootDir, 'src/cli/add-fixtures'),
    destDirs: [resolve(rootDir, 'dist/add-fixtures'), resolve(rootDir, 'dist/cli/add-fixtures')],
  },
]

for (const legacyDir of deletedLegacyDirs) {
  rmSync(legacyDir, { force: true, recursive: true })
}

for (const { sourceDir, destDirs } of copyPairs) {
  if (!existsSync(sourceDir)) {
    throw new Error(`Missing CLI fixture source directory: ${sourceDir}`)
  }

  for (const destDir of destDirs) {
    rmSync(destDir, { force: true, recursive: true })
    mkdirSync(destDir, { recursive: true })
    for (const entry of readdirSync(sourceDir)) {
      cpSync(resolve(sourceDir, entry), resolve(destDir, entry), { recursive: true })
    }
  }
}
