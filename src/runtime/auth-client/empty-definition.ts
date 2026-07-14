// Built-in empty auth-client definition (vNext §8 default resolution step 3).
//
// When a host provides no explicit `auth.client` and no `<srcDir>/convex-auth.ts`
// convention file, `src/module.ts` resolves the `#convex/auth-client` virtual
// module and the generated type registry to this default-exported definition. It
// contains no additional plugins, so the registered client type is exactly the
// base Better Auth client. Framework-free: it imports only the sibling entry.

import { defineConvexAuthClient } from './index'

export default defineConvexAuthClient()
