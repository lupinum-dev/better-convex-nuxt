import { createResolver } from '@nuxt/kit'

export function resolveNuxtCliArgs(from: string, command: string, args: string[] = []) {
  const resolver = createResolver(from)
  return {
    command: process.execPath,
    args: [resolver.resolve('../node_modules/nuxt/bin/nuxt.mjs'), command, ...args],
  }
}
