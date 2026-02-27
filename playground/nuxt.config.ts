import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readEnvLocalValue(name: string): string | undefined {
  const envPath = resolve(process.cwd(), 'playground/.env.local')
  if (!existsSync(envPath)) return undefined

  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (!trimmed.startsWith(`${name}=`)) continue

    const raw = trimmed.slice(name.length + 1)
    const value = raw.split('#')[0]?.trim()
    if (value) return value
  }

  return undefined
}

const convexUrl
  = process.env.CONVEX_URL
    || process.env.NUXT_PUBLIC_CONVEX_URL
    || readEnvLocalValue('CONVEX_URL')

const convexSiteUrl
  = process.env.CONVEX_SITE_URL
    || process.env.NUXT_PUBLIC_CONVEX_SITE_URL
    || readEnvLocalValue('CONVEX_SITE_URL')

export default defineNuxtConfig({
  modules: ["../src/module"],

  pages: true,

  devtools: { enabled: true },

  compatibilityDate: "2026-02-26",

  routeRules: {},

  typescript: {
    strict: true,
  },

  // Keep local E2E deterministic: resolve Convex URLs from process env first,
  // then fall back to playground/.env.local when test-utils env injection timing varies.
  convex: {
    url: convexUrl,
    siteUrl: convexSiteUrl,
    permissions: true, // Enable createPermissions
  },
});
