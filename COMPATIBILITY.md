# Compatibility

`better-convex-nuxt` bundles its backend dependencies so consumers don't need to install them separately. This document tracks which versions are bundled and tested.

### v0.4.x

| Dependency                | Bundled Version  | Consumer Range (if bringing your own) |
| ------------------------- | ---------------- | ------------------------------------- |
| `convex`                  | `^1.34.0`        | `^1.32.0` (optional peer)             |
| `better-auth`             | `>=1.4.9 <1.5.0` | N/A (bundled only)                    |
| `@convex-dev/better-auth` | `^0.10.13`       | N/A (bundled only)                    |
| Nuxt                      | —                | `>=4.0.0`                             |

### v0.3.x

| Dependency                | Bundled Version |
| ------------------------- | --------------- |
| `convex`                  | `^1.32.0`       |
| `better-auth`             | `^1.4.9`        |
| `@convex-dev/better-auth` | `^0.10.13`      |

## Bringing Your Own `convex`

If your app installs `convex` directly (e.g., for Convex backend code), the library declares `convex` as an **optional peer dependency** at `^1.32.0`. Your package manager will warn if your version falls outside this range.

This is the only dependency you might share with the library. `better-auth` and `@convex-dev/better-auth` are used internally and don't conflict with your own installations.

## Upgrade Policy

The trio (`convex` + `better-auth` + `@convex-dev/better-auth`) is always upgraded together in a single release. We never bump one independently.

The `better-auth` range has a ceiling (`<1.5.0`) that matches the `@convex-dev/better-auth` peer constraint. This ceiling is lifted when the Convex adapter adds support for newer better-auth versions.

## CI Verification

Every release is tested against three consumer-smoke fixtures:

- **consumer-smoke**: Basic module (no auth)
- **consumer-smoke-auth**: Auth-enabled with `useConvexAuth` composable
- **consumer-smoke-own-convex**: Consumer with their own `convex` dependency (deduplication test)
