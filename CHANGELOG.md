# Changelog

All notable changes to this project will be documented in this file.

## v0.2.0

[compare changes](https://github.com/lupinum-dev/better-convex-nuxt/compare/v0.1.6...v0.2.0)

### 🚀 Enhancements

- Add useRuntimeConfig import to composables ([cabaaa8](https://github.com/lupinum-dev/better-convex-nuxt/commit/cabaaa8))
- Add logging for subscription changes and ensure cleanup only occurs if an old subscription exists. ([8c1f678](https://github.com/lupinum-dev/better-convex-nuxt/commit/8c1f678))
- Polish ([f7f392e](https://github.com/lupinum-dev/better-convex-nuxt/commit/f7f392e))
- Improve tests ([0c2a144](https://github.com/lupinum-dev/better-convex-nuxt/commit/0c2a144))
- Add trustedOrigins configuration for CORS support and enhance documentation ([0a7186a](https://github.com/lupinum-dev/better-convex-nuxt/commit/0a7186a))
- Add file upload composables (inspired by nuxt-convex) ([c511e56](https://github.com/lupinum-dev/better-convex-nuxt/commit/c511e56))
- Enhance file upload composables with cancel support and improve documentation ([a2dc6f5](https://github.com/lupinum-dev/better-convex-nuxt/commit/a2dc6f5))
- Imrpove error handling to useConvexQuery ([3df5851](https://github.com/lupinum-dev/better-convex-nuxt/commit/3df5851))
- Enhance file upload functionality with validation options and improved documentation ([308af1b](https://github.com/lupinum-dev/better-convex-nuxt/commit/308af1b))
- Update JWT decoding to use Buffer for improved cross-environment compatibility ([747a6bd](https://github.com/lupinum-dev/better-convex-nuxt/commit/747a6bd))
- Add deep reactive query arguments test page and enhance useConvexQuery for deep reactivity detection ([158758a](https://github.com/lupinum-dev/better-convex-nuxt/commit/158758a))
- Add Server Actions Lab page to test fetchQuery and fetchMutation utilities ([2f7f404](https://github.com/lupinum-dev/better-convex-nuxt/commit/2f7f404))
- Enhance PaginationLab with loading state and skeleton UI for better user experience ([b7c3b5a](https://github.com/lupinum-dev/better-convex-nuxt/commit/b7c3b5a))
- Add deduplication option to useConvexPaginatedQuery for improved caching behavior ([c24fd3e](https://github.com/lupinum-dev/better-convex-nuxt/commit/c24fd3e))
- Dev tools phase 1 ([c28c1e0](https://github.com/lupinum-dev/better-convex-nuxt/commit/c28c1e0))
- Dev tools phase 2 ([4131ca2](https://github.com/lupinum-dev/better-convex-nuxt/commit/4131ca2))
- Improve auth state handling in DevTools bridge ([96052a5](https://github.com/lupinum-dev/better-convex-nuxt/commit/96052a5))
- Add raw markdown route handling ([393a737](https://github.com/lupinum-dev/better-convex-nuxt/commit/393a737))
- Enhance navigation menu in AppHeader with new sections for Getting Started, Data Fetching, Mutations, Auth, Server-Side, and Advanced topics ([cdec294](https://github.com/lupinum-dev/better-convex-nuxt/commit/cdec294))
- Add sitemap and robots.txt ([0a5b757](https://github.com/lupinum-dev/better-convex-nuxt/commit/0a5b757))

### 🩹 Fixes

- Update import paths in notes.vue for consistency ([f48da67](https://github.com/lupinum-dev/better-convex-nuxt/commit/f48da67))
- Add missing Posts & Permissions management page with role-based access controls ([c9f7a49](https://github.com/lupinum-dev/better-convex-nuxt/commit/c9f7a49))
- Readme ([9b80df8](https://github.com/lupinum-dev/better-convex-nuxt/commit/9b80df8))
- Update footer credits and improve navigation handling in app.vue ([6b7fc21](https://github.com/lupinum-dev/better-convex-nuxt/commit/6b7fc21))
- Update SSR behavior in documentation and query options to reflect changes in default settings ([2f01bac](https://github.com/lupinum-dev/better-convex-nuxt/commit/2f01bac))
- Update Plausible script source and initialization method ([bdd652c](https://github.com/lupinum-dev/better-convex-nuxt/commit/bdd652c))

### 💅 Refactors

- Update data handling in useConvexQuery to return null instead of undefined when skipped; adjust related documentation and tests ([41ce152](https://github.com/lupinum-dev/better-convex-nuxt/commit/41ce152))
- Playground phase 1 ([9c7a559](https://github.com/lupinum-dev/better-convex-nuxt/commit/9c7a559))
- Playground phase 2 ([af93f88](https://github.com/lupinum-dev/better-convex-nuxt/commit/af93f88))
- Wrap NuxtPage in NuxtLayout for improved structure ([93150c1](https://github.com/lupinum-dev/better-convex-nuxt/commit/93150c1))
- Change docs to /docs subpage ([d3e8307](https://github.com/lupinum-dev/better-convex-nuxt/commit/d3e8307))

### 🏡 Chore

- **release:** V0.1.6 ([b49b9f4](https://github.com/lupinum-dev/better-convex-nuxt/commit/b49b9f4))
- Update release script to use --prune option for git fetch ([ec6cdd1](https://github.com/lupinum-dev/better-convex-nuxt/commit/ec6cdd1))
- Remove outdated _todo.md file and update installation instructions in README.md to use pnpm ([2511016](https://github.com/lupinum-dev/better-convex-nuxt/commit/2511016))
- Update dependencies and improve logging documentation ([d30ee62](https://github.com/lupinum-dev/better-convex-nuxt/commit/d30ee62))
- Remove outdated call-to-action section from index documentation ([5561f7f](https://github.com/lupinum-dev/better-convex-nuxt/commit/5561f7f))

### ❤️ Contributors

- Mat4m0 <matthias.amon@me.com>

## v0.1.6

[compare changes](https://github.com/lupinum-dev/better-convex-nuxt/compare/v0.1.5...v0.1.6)

### 🩹 Fixes

- Replace $fetch with fetch in API calls and update package.json for server types ([2dae71c](https://github.com/lupinum-dev/better-convex-nuxt/commit/2dae71c))

### 💅 Refactors

- Update index.md for improved structure and formatting ([b039ad2](https://github.com/lupinum-dev/better-convex-nuxt/commit/b039ad2))

### 🏡 Chore

- Remove vite override from package.json ([c144828](https://github.com/lupinum-dev/better-convex-nuxt/commit/c144828))
- Add TypeScript configuration extending Nuxt settings ([81031bf](https://github.com/lupinum-dev/better-convex-nuxt/commit/81031bf))

### ❤️ Contributors

- Mat4m0 <matthias.amon@me.com>

## v0.1.5

[compare changes](https://github.com/lupinum-dev/better-convex-nuxt/compare/v0.1.3...v0.1.5)

### 🏡 Chore

- **release:** V0.1.3 ([06d53b0](https://github.com/lupinum-dev/better-convex-nuxt/commit/06d53b0))

### ❤️ Contributors

- Mat4m0 <matthias.amon@me.com>

## v0.1.3

[compare changes](https://github.com/lupinum-dev/better-convex-nuxt/compare/v0.1.1...v0.1.3)

### 🏡 Chore

- **release:** V0.1.1 ([cd00ff4](https://github.com/lupinum-dev/better-convex-nuxt/commit/cd00ff4))

### ❤️ Contributors

- Mat4m0 <matthias.amon@me.com>

## v0.1.1


### 🩹 Fixes

- Lint ([ab6c72e](https://github.com/lupinum-dev/better-convex-nuxt/commit/ab6c72e))
- Update navigation link for getting started section ([849b4cc](https://github.com/lupinum-dev/better-convex-nuxt/commit/849b4cc))

### 💅 Refactors

- Improve type safety and simplify method retrieval in auth API handler ([1c78346](https://github.com/lupinum-dev/better-convex-nuxt/commit/1c78346))

### 🏡 Chore

- Update ESLint configuration to allow self-closing void elements and apply consistent self-closing syntax in Vue components ([ef1a804](https://github.com/lupinum-dev/better-convex-nuxt/commit/ef1a804))
- Update playground configurations to not typecheck for now ([f587ce7](https://github.com/lupinum-dev/better-convex-nuxt/commit/f587ce7))
- Prepare first release ([7003857](https://github.com/lupinum-dev/better-convex-nuxt/commit/7003857))

### ❤️ Contributors

- Mat4m0 <matthias.amon@me.com>

## [Unreleased]

### Added

- Initial release
- Real-time queries with SSR support (`useConvexQuery`, `useLazyConvexQuery`)
- Mutations with optimistic updates (`useConvexMutation`)
- Actions support (`useConvexAction`)
- Paginated queries (`useConvexPaginatedQuery`)
- Authentication integration with Better Auth (`useConvexAuth`, `useAuthClient`)
- Permission system (`createPermissions`)
- Connection state monitoring (`useConvexConnectionState`)
- Cached query access (`useConvexCached`)
- Server utilities (`fetchQuery`, `fetchMutation`, `fetchAction`)
- Auth components (`ConvexAuthenticated`, `ConvexUnauthenticated`, `ConvexAuthLoading`)
- Full TypeScript support with Convex schema inference
