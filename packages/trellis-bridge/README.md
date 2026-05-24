# @lupinum/trellis-bridge

Package-author bridge utilities for Trellis-aware Convex component integrations.

This package is for integration authors building packages such as a CMS,
billing module, or other Convex component-backed product surface. Regular
Trellis app code should use the main `@lupinum/trellis` runtime helpers instead.

## Compatibility

`@lupinum/trellis-bridge@0.1.0` is released with:

| Package            | Version    |
| ------------------ | ---------- |
| `@lupinum/trellis` | `0.4.0`    |
| `convex`           | `^1.38.0`  |
| `convex-helpers`   | `^0.1.117` |

The bridge package is intentionally small. It owns bridge manifests, generated
host file rendering, managed bridge edits, and drift checks. Product-facing
install commands should stay in the product package that owns the integration.
