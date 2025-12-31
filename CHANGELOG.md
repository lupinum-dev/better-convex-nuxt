# Changelog

All notable changes to this project will be documented in this file.

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
