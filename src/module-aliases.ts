interface NuxtAliasRegistrationTarget {
  options: {
    alias: Record<string, string>
    buildDir: string
  }
  hook: (
    name: 'prepare:types',
    callback: (options: {
      references: Array<{ path?: string; types?: string }>
      tsConfig: { compilerOptions?: { paths?: Record<string, string[]> } }
    }) => void | Promise<void>,
  ) => unknown
}

interface ModuleAliasResolver {
  resolve: (...path: string[]) => string
}

export function registerConvexAliases(options: {
  nuxt: NuxtAliasRegistrationTarget
  resolver: ModuleAliasResolver
  convexApiAlias: string
}): void {
  const { nuxt, resolver, convexApiAlias } = options
  const convexServerAlias = resolver.resolve('./runtime/server/index')

  nuxt.options.alias['#convex/api'] = convexApiAlias
  nuxt.options.alias['#convex/server'] = convexServerAlias

  nuxt.hook('prepare:types', (opts) => {
    opts.references.push({
      path: resolver.resolve(nuxt.options.buildDir, 'types/better-convex-nuxt.d.ts'),
    })
    opts.tsConfig.compilerOptions ??= {}
    opts.tsConfig.compilerOptions.paths ??= {}
    opts.tsConfig.compilerOptions.paths['#convex/api'] = [convexApiAlias]
    opts.tsConfig.compilerOptions.paths['#convex/server'] = [convexServerAlias]
  })
}
