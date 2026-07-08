// Node/unit-tier shim for Nuxt's `#app` virtual module. Only the symbols that
// unit-tested src modules import need to exist here. `clearNuxtData` is a no-op
// in unit tests — its real payload-purge behavior is covered in the nuxt tier
// (test/nuxt/useConvexQuery.signout-purge.nuxt.test.ts).
export function clearNuxtData(_keys?: string | string[] | ((key: string) => boolean)): void {}
