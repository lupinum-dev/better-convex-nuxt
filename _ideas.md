# Ideas & Future Enhancements

Ideas for future improvements to the Convexi module. These are not planned features, just collected thoughts for potential future work.

---

## Role Helpers (Proposed)

**Status:** Idea  
**Complexity:** Medium

Add optional role helper generation to `createPermissions()`.

### Current State

Users manually create role helpers in their composable:

```typescript
const isOwner = computed(() => role.value === "owner");
const isAdmin = computed(() => role.value === "admin");
const canManageTeam = computed(
  () => role.value === "owner" || role.value === "admin",
);
```

### Proposed Enhancement

Add optional `roles` config to auto-generate helpers:

```typescript
export const { usePermissions } = createPermissions({
  query: api.auth.getPermissionContext,
  checkPermission,
  roles: ["owner", "admin", "member", "viewer"] as const, // Optional
});

// Auto-generates reactive helpers:
const {
  isOwner, // ComputedRef<boolean>
  isAdmin, // ComputedRef<boolean>
  isMember, // ComputedRef<boolean>
  isViewer, // ComputedRef<boolean>
} = usePermissions();
```

### Considerations

- Keep it opt-in to avoid bloat for users who don't need it
- TypeScript: Generate helper types from roles array using template literals
- May need role hierarchy awareness for compound helpers like `canManageTeam`
- Could also generate `hasRole(role)` function for dynamic checks

### Alternative

Document the pattern in docs instead of building it into the module, since it's straightforward to implement in user-land.
Can we make so our task list? So it per team, using proper permission, shows which user created them ,, | keep as is but make everything with real backend! | Transform the data so we can see them!

# RFC: Support for `user.additionalFields` in @convex-dev/better-auth

**Author:** Matthias
**Status:** Draft
**Created:** 2025-12-25
**Target:** @convex-dev/better-auth

---

## Summary

This RFC proposes adding support for Better Auth's [`user.additionalFields`](https://www.better-auth.com/docs/concepts/users-accounts) configuration to the `@convex-dev/better-auth` Convex component. Currently, when users configure additional fields on the user model (e.g., `role`, `plan`, `preferences`), the Convex adapter rejects the data because the component's schema validator doesn't include these fields.

---

## Motivation

### The Problem

Better Auth supports extending the user schema via `additionalFields`:

```typescript
export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    // ...
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "user",
          input: false,
        },
      },
    },
  });
};
```

However, when using the Convex adapter, this fails with:

```
ArgumentValidationError: Value does not match validator.
Path: .input
Value: {data: {..., role: "user", ...}, model: "user"}
Validator: v.union(v.object({data: v.object({...no role field...}), model: v.literal("user")}), ...)
```

This occurs because:

1. The component's schema (`src/component/schema.ts`) is auto-generated with a fixed set of fields
2. The adapter functions (`create`, `update`, etc.) have strict validators based on this schema
3. There's no mechanism to extend the schema at installation time

### Why This Matters

Adding custom fields to users is one of the most common requirements in authentication systems:

- **Role-based access control (RBAC):** `role: "admin" | "user" | "moderator"`
- **Subscription tiers:** `plan: "free" | "pro" | "enterprise"`
- **User preferences:** `theme`, `locale`, `timezone`
- **Application-specific data:** `organizationId`, `teamId`, `department`

Currently, developers must either:

1. **Local Install:** Copy the entire component locally and regenerate the schema - adds maintenance burden
2. **Separate Table:** Create a parallel `userProfiles` table - splits user data across tables, requires joins

Neither option is ideal. Better Auth's `additionalFields` is the canonical way to extend user data, and it should work with Convex.

---

## Current Architecture

### Schema Generation

The component's schema is generated via Better Auth CLI:

```bash
npx @better-auth/cli generate --output src/component/schema.ts -y
```

This produces a fixed schema based on `auth-options.ts`:

```typescript
// src/component/schema.ts (auto-generated)
export const tables = {
  user: defineTable({
    name: v.string(),
    email: v.string(),
    emailVerified: v.boolean(),
    // ... fixed fields only
  }),
};
```

### Adapter Validation

The adapter functions use strict validators derived from the schema:

```typescript
// src/component/_generated/component.ts
create: FunctionReference<
  "mutation",
  "internal",
  {
    input: {
      data: {
        name: string;
        email: string;
        // ... only fields from schema.ts
        // NO role, NO custom fields
      };
      model: "user";
    };
  }
>;
```

### The Gap

Better Auth passes `additionalFields` data to the adapter, but the Convex component rejects it because the validator was generated without knowledge of user-defined fields.

---

## Proposed Solution

### Option A: Dynamic Schema Extension (Recommended)

Allow users to pass additional field definitions when installing the component:

#### 1. Extend Component Configuration

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";
import { v } from "convex/values";

const app = defineApp();

app.use(betterAuth, {
  // New: user-defined additional fields
  userFields: {
    role: v.optional(v.string()),
    plan: v.optional(v.string()),
    metadata: v.optional(v.string()), // JSON stringified
  },
  sessionFields: {
    // Optional: extend session too
    deviceId: v.optional(v.string()),
  },
});

export default app;
```

#### 2. Merge Fields at Build Time

The component would merge user-defined fields into the base schema during `convex dev`:

```typescript
// @convex-dev/better-auth/src/component/schema.ts
import { baseUserFields } from "./base-schema.js";

export const createSchema = (userFields = {}, sessionFields = {}) => {
  return defineSchema({
    user: defineTable({
      ...baseUserFields,
      ...userFields, // Merged at build time
    }),
    // ...
  });
};
```

#### 3. Use Permissive Validators for Additional Fields

For the adapter functions, accept additional fields via `v.any()` or a configurable validator:

```typescript
// Adapter create function
create: internalMutation({
  args: {
    input: v.union(
      v.object({
        model: v.literal("user"),
        data: v.object({
          ...baseUserValidator,
          // Allow any additional fields
          ...v.record(v.string(), v.any()),
        }),
      }),
      // ... other models
    ),
  },
  handler: async (ctx, args) => {
    // Validate against configured schema
    return ctx.db.insert(args.input.model, args.input.data);
  },
});
```

### Option B: Passthrough Unknown Fields

A simpler but less type-safe approach - modify the adapter to pass through unknown fields:

```typescript
// In adapter create handler
handler: async (ctx, args) => {
  const { model, data } = args.input;

  // Strip unknown fields for validation, but store them anyway
  const knownFields = getKnownFields(model);
  const additionalFields = omit(data, knownFields);

  // Store with additional fields
  return ctx.db.insert(model, {
    ...pick(data, knownFields),
    ...additionalFields, // Passthrough
  });
};
```

**Caveat:** This requires schema-level support in Convex for storing unknown fields, which may not be possible with strict schemas.

### Option C: Reserved Extension Field

Add a single `metadata` field for custom data:

```typescript
// schema.ts
user: defineTable({
  // ... existing fields
  metadata: v.optional(v.string()), // JSON stringified custom data
}),
```

```typescript
// Usage in Better Auth config
user: {
  additionalFields: {
    role: {
      type: "string",
      defaultValue: "user",
      // Stored in metadata JSON
    },
  },
},
```

**Pros:** Minimal schema changes, backwards compatible
**Cons:** No type safety, no indexing on custom fields, JSON parsing overhead

---

## Recommended Approach: Option A

Option A provides the best developer experience:

1. **Type Safety:** Custom fields are properly typed in Convex
2. **Indexing:** Users can add indexes on custom fields
3. **Better Auth Compatibility:** Works with Better Auth's `additionalFields` as designed
4. **No Local Install Required:** Extends the component without forking

### Implementation Steps

1. **Update `convex.config.ts` schema** to accept field definitions:

   ```typescript
   import { defineComponent, type Validator } from "convex/server";

   export interface BetterAuthComponentArgs {
     userFields?: Record<string, Validator<any>>;
     sessionFields?: Record<string, Validator<any>>;
   }

   const component = defineComponent("betterAuth");
   export default component;
   ```

2. **Modify schema generation** to merge user fields:

   ```typescript
   // src/component/schema.ts
   import { getComponentArgs } from "convex/server";
   import { baseUserTable } from "./base-tables.js";

   const args = getComponentArgs<BetterAuthComponentArgs>();

   export default defineSchema({
     user: defineTable({
       ...baseUserTable,
       ...(args?.userFields ?? {}),
     }),
   });
   ```

3. **Update adapter validators** to include additional fields dynamically

4. **Update type exports** so `Doc<"user">` includes custom fields

5. **Document the feature** with examples for common use cases

---

## Migration Path

### For Existing Users

No breaking changes. The component continues to work without additional configuration. Users opting into `userFields` would:

1. Update `convex.config.ts` with field definitions
2. Run `npx convex dev` to regenerate schema
3. Add `additionalFields` to their Better Auth config
4. Fields are now persisted and typed

### Data Migration

If users have been storing custom data via workarounds (separate tables, JSON in existing fields), they would need to migrate that data to the new fields.

---

## Alternatives Considered

### 1. Local Install Only

**Current recommendation** in the docs. Users copy the component locally and regenerate schema.

**Rejected because:**

- High maintenance burden (manual updates when component releases new versions)
- Requires understanding of component internals
- Not the "just works" experience developers expect

### 2. Separate User Profile Table

Store custom fields in a parallel table linked by `authUserId`.

**Rejected because:**

- Requires joins for every user query
- Splits user data across tables
- Doesn't leverage Better Auth's built-in `additionalFields` feature

### 3. Generic `v.any()` Fields

Accept any data in user documents without schema definition.

**Rejected because:**

- Loses Convex's type safety benefits
- No validation on write
- Potential for data corruption

---

## Open Questions

1. **Convex Component Args:** Does Convex's component system support passing configuration that affects schema generation? If not, what runtime alternatives exist?

2. **Validator Passthrough:** Can we use `v.object({...knownFields, ...v.record(v.string(), v.any())})` to accept known fields with strict validation while allowing additional fields?

3. **Better Auth CLI Integration:** Should the schema generation step be modified to read from a user config file that specifies additional fields?

4. **Index Support:** How do users add indexes on custom fields without local install?

---

## References

- [Better Auth: User Additional Fields](https://www.better-auth.com/docs/concepts/users-accounts)
- [Better Auth: Database Schema](https://www.better-auth.com/docs/concepts/database)
- [Convex: Authoring Components](https://docs.convex.dev/components/authoring)
- [Convex + Better Auth: Local Install](https://labs.convex.dev/better-auth/features/local-install)
- [@convex-dev/better-auth on npm](https://www.npmjs.com/package/@convex-dev/better-auth)

---

## Appendix: Error Reproduction

```typescript
// convex/auth.ts
export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "user",
          input: false,
        },
      },
    },
    plugins: [convex({ authConfig })],
  });
};
```

**Result on sign-up:**

```
ArgumentValidationError: Value does not match validator.
Path: .input
Value: {data: {createdAt: ..., email: "user@example.com", ..., role: "user", ...}, model: "user"}
Validator: v.union(v.object({data: v.object({...}), model: v.literal("user")}), ...)
```

The `role: "user"` field is rejected because it's not in the validator.
