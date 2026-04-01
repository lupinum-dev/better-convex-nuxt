# RFC: Shared Validation Contracts via Standard Schema

**Status:** Draft
**Author:** Matthias Amon
**Date:** 2026-03-27
**Module:** better-convex-nuxt v0.4.0

---

## Summary

Add first-class support for shared validation contracts that let users define a schema once (as Convex validators) and reuse it across the entire stack: Convex backend functions, Vue forms, Nuxt server routes, and client-side pre-validation — without introducing any new runtime dependencies.

The bridge is **Standard Schema V1**, already supported by convex-helpers and the Vue/Nuxt ecosystem.

---

## Motivation

Today, users of better-convex-nuxt define validation in two or more places:

1. **Convex functions** — `args: { title: v.string(), body: v.string() }`
2. **Vue forms** — a separate Zod/Valibot/hand-rolled schema for VeeValidate, FormKit, or Nuxt UI
3. **Nitro server routes** — yet another validation in `readValidatedBody()`

This duplication creates drift, bugs, and extra maintenance. The natural source of truth is the Convex validator — it defines the contract the backend enforces. Everything else should derive from it.

### Why Standard Schema

[Standard Schema](https://github.com/standard-schema/standard-schema) (v1) is a vendor-neutral interface for validation. It has been adopted by:

| Library | Standard Schema Support |
|---|---|
| **Zod v4** | Native producer |
| **Valibot v1+** | Native producer |
| **VeeValidate** | Native consumer (via `toTypedSchema()`) |
| **FormKit** | Native consumer |
| **Nuxt UI v3** | Native consumer (form components) |
| **tRPC** | Native consumer |

`@standard-schema/spec` is a **types-only** package (zero runtime code, zero bundle impact). It is already an installed peer dependency of `convex-helpers`.

The key insight: **convex-helpers already ships `toStandardSchema()`** which converts any Convex validator into a Standard Schema V1 compliant object. We don't need to invent anything — we need to surface this bridge with good DX.

---

## Design Principles

1. **Define once, use everywhere** — The Convex validator is the single source of truth
2. **Zero new dependencies** — Everything needed is already installed (`convex-helpers/standardSchema`, `@standard-schema/spec`)
3. **Vue/Nuxt-native** — Composables, auto-imports, works with VeeValidate/FormKit/Nuxt UI out of the box
4. **Opt-in** — Users who don't need shared validation aren't affected
5. **Library-agnostic** — Users can still use Zod/Valibot if they prefer; all produce Standard Schema

---

## Architecture

```
                    ┌─────────────────────────────────┐
                    │   Convex Validators (v.*)        │
                    │   Source of truth — defined once  │
                    │   in convex/ directory            │
                    └──────────────┬──────────────────┘
                                   │
                      toStandardSchema(validator)
                      (convex-helpers/standardSchema)
                                   │
              ┌────────────────────┼─────────────────────┐
              ▼                    ▼                      ▼
    ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
    │  Vue Forms       │  │  Server Routes   │  │  Client-side     │
    │  VeeValidate     │  │  Nitro/H3        │  │  Pre-validation  │
    │  FormKit         │  │  readValidated   │  │  before mutation  │
    │  Nuxt UI         │  │  Body/Query      │  │  or action call   │
    └─────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## API Surface

### 1. Auto-imported utilities

#### `useConvexSchema(validator)` — Composable for form binding

Converts a Convex validator into a Standard Schema object, ready for Vue form libraries.

```vue
<script setup lang="ts">
import { v } from 'convex/values'
// Or import shared validators from your convex/ directory:
// import { createPostArgs } from '~/convex/schemas/post'

const schema = useConvexSchema(v.object({
  title: v.string(),
  body: v.string(),
}))

// schema is StandardSchemaV1 — plug directly into any form library
</script>
```

**With VeeValidate:**

```vue
<script setup lang="ts">
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/standard-schema'
import { createPostArgs } from '~/convex/schemas/post'

const schema = useConvexSchema(v.object(createPostArgs))

const { handleSubmit } = useForm({
  validationSchema: toTypedSchema(schema),
})

const createPost = useConvexMutation(api.posts.create)

const onSubmit = handleSubmit(async (values) => {
  await createPost(values) // values are already validated & typed
})
</script>
```

**With Nuxt UI v3:**

```vue
<script setup lang="ts">
import { createPostArgs } from '~/convex/schemas/post'

const schema = useConvexSchema(v.object(createPostArgs))
const createPost = useConvexMutation(api.posts.create)

async function onSubmit(event: FormSubmitEvent) {
  await createPost(event.data)
}
</script>

<template>
  <UForm :schema="schema" @submit="onSubmit">
    <UFormField name="title">
      <UInput />
    </UFormField>
    <UFormField name="body">
      <UTextarea />
    </UFormField>
    <UButton type="submit">Create</UButton>
  </UForm>
</template>
```

**With FormKit:**

```vue
<script setup lang="ts">
import { createPostArgs } from '~/convex/schemas/post'

const schema = useConvexSchema(v.object(createPostArgs))
</script>

<template>
  <FormKit type="form" :validation-schema="schema" @submit="onSubmit">
    <FormKit type="text" name="title" label="Title" />
    <FormKit type="textarea" name="body" label="Body" />
  </FormKit>
</template>
```

**Implementation:** Thin wrapper around `toStandardSchema()`. The composable exists for auto-import convenience and to future-proof for reactive scenarios.

```ts
// src/runtime/composables/useConvexSchema.ts
import { toStandardSchema } from 'convex-helpers/standardSchema'
import type { Validator, Infer } from 'convex/values'
import type { StandardSchemaV1 } from '@standard-schema/spec'

export function useConvexSchema<V extends Validator<any, any, any>>(
  validator: V,
): StandardSchemaV1<Infer<V>> {
  return toStandardSchema(validator)
}
```

---

#### `validateConvexArgs(validator)` — Server-side validation for H3

Returns a validation function compatible with H3's `readValidatedBody()` and `getValidatedQuery()`.

```ts
// server/api/posts.post.ts
import { v } from 'convex/values'

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(
    event,
    validateConvexArgs(v.object({
      title: v.string(),
      body: v.string(),
    }))
  )
  // body is typed as { title: string; body: string }
  return serverConvexMutation(event, api.posts.create, body)
})
```

**With shared validators:**

```ts
// server/api/posts.post.ts
import { createPostArgs } from '~/convex/schemas/post'

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(
    event,
    validateConvexArgs(v.object(createPostArgs))
  )
  return serverConvexMutation(event, api.posts.create, body)
})
```

**Implementation:** Bridges `toStandardSchema` output to H3's expected function signature `(data: unknown) => T`.

H3 1.x `readValidatedBody` expects `(data: unknown) => T | true | false | void` — it does not natively consume Standard Schema objects. We bridge this:

```ts
// src/runtime/server/utils/validation.ts
import { toStandardSchema } from 'convex-helpers/standardSchema'
import { createError } from 'h3'
import type { Validator, Infer } from 'convex/values'

export function validateConvexArgs<V extends Validator<any, any, any>>(
  validator: V,
): (data: unknown) => Infer<V> {
  const schema = toStandardSchema(validator)
  return (data: unknown) => {
    const result = schema['~standard'].validate(data)
    // toStandardSchema is synchronous, so result is never a Promise
    if ('issues' in (result as any)) {
      const issues = (result as any).issues
      throw createError({
        statusCode: 400,
        statusMessage: 'Validation Error',
        message: issues.map((i: any) => i.message).join('; '),
        data: { issues },
      })
    }
    return (result as any).value
  }
}
```

---

### 2. Re-export of `toStandardSchema`

For users who want the raw Standard Schema object without the composable wrapper:

```ts
// Auto-imported in both client and server contexts
import { toStandardSchema } from 'convex-helpers/standardSchema'
```

This is re-exported from both `better-convex-nuxt/composables` and `better-convex-nuxt/server` for explicit imports, and auto-imported by the module.

---

### 3. The Shared Schema Pattern (documentation)

The recommended pattern is to extract validators into shared files:

```
convex/
├── _generated/
├── schema.ts          # Table definitions
├── schemas/           # Shared validators (new convention)
│   ├── post.ts
│   └── user.ts
├── posts.ts           # Uses schemas/post.ts
└── ...
```

```ts
// convex/schemas/post.ts
import { v } from 'convex/values'

/** Shared args for creating a post — used by mutation, forms, and server routes */
export const createPostArgs = {
  title: v.string(),
  body: v.string(),
  categoryId: v.id('categories'),
}

/** Shared args for updating a post */
export const updatePostArgs = {
  id: v.id('posts'),
  title: v.optional(v.string()),
  body: v.optional(v.string()),
}
```

```ts
// convex/posts.ts
import { createPostArgs, updatePostArgs } from './schemas/post'

export const create = mutation({
  args: createPostArgs,
  handler: async (ctx, args) => {
    return await ctx.db.insert('posts', args)
  },
})

export const update = mutation({
  args: updatePostArgs,
  handler: async (ctx, args) => {
    const { id, ...patch } = args
    await ctx.db.patch(id, patch)
  },
})
```

```vue
<!-- pages/posts/new.vue -->
<script setup lang="ts">
import { v } from 'convex/values'
import { createPostArgs } from '~/convex/schemas/post'

const schema = useConvexSchema(v.object(createPostArgs))
const createPost = useConvexMutation(api.posts.create)
</script>

<template>
  <UForm :schema="schema" @submit="({ data }) => createPost(data)">
    <!-- ... -->
  </UForm>
</template>
```

```ts
// server/api/posts.post.ts — same validators, server-side
import { v } from 'convex/values'
import { createPostArgs } from '~/convex/schemas/post'

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, validateConvexArgs(v.object(createPostArgs)))
  return serverConvexMutation(event, api.posts.create, body)
})
```

**One schema. Three layers. Zero drift.**

---

## What About Zod and Valibot?

This RFC deliberately does **not** add Zod or Valibot as dependencies. Here's why:

### Convex validators are sufficient

Convex validators cover all the types that flow through the Convex protocol: strings, numbers, booleans, IDs, objects, arrays, unions, literals, optional, and null. For data contracts between frontend and backend, this is the complete set.

### Standard Schema is the meeting point

Users who prefer Zod or Valibot can still use them — both produce Standard Schema objects natively:

```ts
// Zod v4 — natively produces Standard Schema
import * as z from 'zod'
const schema = z.object({ title: z.string(), body: z.string() })
// schema is already StandardSchemaV1 — works with Nuxt UI, VeeValidate, etc.

// Valibot v1+ — natively produces Standard Schema
import * as v from 'valibot'
const schema = v.object({ title: v.string(), body: v.string() })
// schema is already StandardSchemaV1
```

### convex-helpers already has Zod ↔ Convex conversion

For users who want the Zod DX (`.email()`, `.min()`, `.transform()`, etc.) on the Convex side, `convex-helpers/server/zod4` provides `zCustomQuery`, `zCustomMutation`, and bidirectional conversion utilities. This is orthogonal to what we ship.

### Refinements and transforms

Convex validators don't support refinements like `.email()` or `.min(5)`. For form validation with these constraints, users have three options:

1. **Use Convex validators for shape, add per-field rules in the form** — simplest approach, keeps validation localized
2. **Use Zod/Valibot for the form, Convex validators for the backend** — both produce Standard Schema, fully compatible
3. **Use `convex-helpers/server/zod4` on the backend too** — full Zod everywhere, but that's outside our scope

We document all three patterns without opinionating.

---

## Module Integration

### New auto-imports

| Import | Context | Source |
|---|---|---|
| `useConvexSchema` | Client + SSR | `composables/useConvexSchema` |
| `toStandardSchema` | Client + SSR | `convex-helpers/standardSchema` |
| `validateConvexArgs` | Server only | `server/utils/validation` |

### Module changes (`src/module.ts`)

```ts
// In the addImports block:
addImports([
  // ... existing imports ...
  { name: 'useConvexSchema', from: resolver.resolve('./runtime/composables/useConvexSchema') },
  { name: 'toStandardSchema', from: 'convex-helpers/standardSchema' },
])

// In the addServerImports block:
addServerImports([
  // ... existing imports ...
  { name: 'validateConvexArgs', from: resolver.resolve('./runtime/server/utils/validation') },
  { name: 'toStandardSchema', from: 'convex-helpers/standardSchema' },
])
```

### New exports

```ts
// better-convex-nuxt/composables
export { useConvexSchema } from './useConvexSchema'
export { toStandardSchema } from 'convex-helpers/standardSchema'

// better-convex-nuxt/server
export { validateConvexArgs } from './utils/validation'
export { toStandardSchema } from 'convex-helpers/standardSchema'
```

### No new dependencies

| Package | Already installed | Type |
|---|---|---|
| `convex-helpers` | Yes (transitive via convex) | Runtime |
| `@standard-schema/spec` | Yes (peer dep of convex-helpers) | Types only |
| `convex` | Yes (direct dependency) | Runtime |

---

## Files to Add/Modify

### New files

| File | Purpose | ~Lines |
|---|---|---|
| `src/runtime/composables/useConvexSchema.ts` | Client composable | ~15 |
| `src/runtime/server/utils/validation.ts` | Server validation bridge | ~25 |

### Modified files

| File | Change |
|---|---|
| `src/module.ts` | Add auto-imports for `useConvexSchema`, `toStandardSchema`, `validateConvexArgs` |
| `src/runtime/composables/index.ts` | Export `useConvexSchema` and re-export `toStandardSchema` |
| `src/runtime/server/index.ts` | Export `validateConvexArgs` and re-export `toStandardSchema` |

### Documentation

- Guide page: "Shared Validation" — covers the pattern, form library integration, server route validation
- API reference entries for `useConvexSchema` and `validateConvexArgs`

---

## Testing Plan

1. **Unit tests** — `useConvexSchema` returns valid Standard Schema objects for all Convex validator types
2. **Unit tests** — `validateConvexArgs` passes valid data, throws H3-compatible errors on invalid data
3. **Integration test** — Shared validators work across a Convex mutation, Vue component with Nuxt UI form, and Nitro server route
4. **Type tests** — TypeScript infers correct types from Convex validators through to form `onSubmit` handlers

---

## Future Considerations

### `convexFormSchema(api.posts.create)` — Extract args from FunctionReference

A utility that extracts the argument validator directly from a Convex function reference, so users don't need to separately export raw validators. This is not possible today because `FunctionReference` doesn't carry the validator at runtime — only the TypeScript type. This would require upstream Convex support (e.g., a `getArgsValidator()` API).

**Deferred**: Would be ideal DX but requires Convex SDK changes.

### H3 native Standard Schema support

H3 v2 (in development) may add native Standard Schema consumption in `readValidatedBody`. When that lands, `validateConvexArgs` could simplify to just re-exporting `toStandardSchema`. We'd keep the function name as a stable API.

### Reactive validators

If validators ever need to be computed reactively (e.g., conditional fields based on user state), `useConvexSchema` is the right place to add that without breaking the API.

---

## Decision Record

| Decision | Rationale |
|---|---|
| Standard Schema over Zod/Valibot | Zero deps, universal bridge, already installed |
| Composable wrapper over raw re-export | Auto-import DX, future extensibility |
| H3 adapter function over monkey-patching | Clean, explicit, no surprises |
| Shared `convex/schemas/` convention | Follows Convex conventions, colocates with functions |
| No refinement support | Out of scope — Convex validators define protocol shape, not UI constraints |

---

## References

- [Standard Schema Spec](https://github.com/standard-schema/standard-schema)
- [convex-helpers `toStandardSchema`](https://github.com/get-convex/convex-helpers#standard-schema)
- [convex-helpers Zod integration](https://github.com/get-convex/convex-helpers#zod-validation)
- [VeeValidate Standard Schema](https://vee-validate.logaretm.com/v4/integrations/standard-schema/)
- [Nuxt UI v3 Form validation](https://ui.nuxt.com/components/form)
- [H3 `readValidatedBody`](https://h3.unjs.io/utils/request#readvalidatedbodyevent-validate)
