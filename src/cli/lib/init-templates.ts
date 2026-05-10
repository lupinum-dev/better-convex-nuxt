import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const initTemplateDirCandidates = [
  resolve(dirname(fileURLToPath(import.meta.url)), '../templates/init'),
  resolve(dirname(fileURLToPath(import.meta.url)), './templates/init'),
]
function resolveInitTemplateDir(): string {
  const initTemplateDir = initTemplateDirCandidates.find((path) => existsSync(path))
  if (!initTemplateDir) {
    throw new Error(
      `Missing CLI template directory. Checked: ${initTemplateDirCandidates.join(', ')}`,
    )
  }

  return initTemplateDir
}
const initTemplateDir = resolveInitTemplateDir()
const staticTemplateCache = new Map<string, string>()

function readStaticTemplate(name: string): string {
  const cached = staticTemplateCache.get(name)
  if (cached) return cached

  const content = readFileSync(resolve(initTemplateDir, `${name}.tpl`), 'utf8')
  staticTemplateCache.set(name, content)
  return content
}

export function uploadsDomainTemplate() {
  return readStaticTemplate('uploadsDomainTemplate')
}

export function uploadsContractTemplate() {
  return readStaticTemplate('uploadsContractTemplate')
}

export function uploadsPageTemplate() {
  return readStaticTemplate('uploadsPageTemplate')
}

export function routeShellTemplate(options: { importPath: string; componentName: string }) {
  return `
<script setup lang="ts">
import ${options.componentName} from '${options.importPath}'
</script>

<template>
  <${options.componentName} />
</template>
`.trimStart()
}
