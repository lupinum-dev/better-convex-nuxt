import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const copyPairs = [
  {
    sourceDir: resolve(rootDir, 'src/cli/templates'),
    destDirs: [resolve(rootDir, 'dist/templates'), resolve(rootDir, 'dist/cli/templates')],
  },
  {
    sourceDir: resolve(rootDir, 'src/cli/starter-fixtures'),
    destDirs: [
      resolve(rootDir, 'dist/starter-fixtures'),
      resolve(rootDir, 'dist/cli/starter-fixtures'),
    ],
  },
]

for (const { sourceDir, destDirs } of copyPairs) {
  if (!existsSync(sourceDir)) {
    throw new Error(`Missing CLI template source directory: ${sourceDir}`)
  }

  for (const destDir of destDirs) {
    rmSync(destDir, { force: true, recursive: true })
    mkdirSync(destDir, { recursive: true })
    for (const entry of readdirSync(sourceDir)) {
      cpSync(resolve(sourceDir, entry), resolve(destDir, entry), { recursive: true })
    }
  }
}
