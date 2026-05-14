# Maintaining Trellis

Trellis owns the generic Nuxt, Convex, Better Auth, MCP, identity-forwarding,
operation, and destructive-confirmation primitives. It must stay CMS-neutral.

## Release Commands

```bash
pnpm release:verify
pnpm release:pack
pnpm release:publish
```

`release:verify` is the full local gate. `release:pack` leaves publishable
tarballs under `.pack/` and rejects `workspace:*` leaks.

## Compatibility Tuple

The supported dependency tuple is tracked in `compatibility.json`. Release
checks use that file to reject stale pins in examples, fixtures, and starter
templates.

Intentional holds:

- `h3@1.15.11` until h3 2 is stable and Nuxt ecosystem peers accept it.
- Vite 7 until Vite 8 peer support is clean across Nuxt and Vitest.
- Nuxt DevTools 3.2.4 while DevTools 4 is alpha.

## Ownership Boundary

Trellis owns generic runtime primitives. It must not depend on Ginko CMS,
Ginko Content, private consumer apps, CMS schema concepts, or host-specific
release canaries.
