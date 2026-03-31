# Course LMS Example

This is the learning-platform SaaS example.

It shows:

- role checks for staff
- enrollment-based access for students
- prerequisite and timed-unlock guards
- backend-owned permission context exposed to Nuxt through `createAuth` from `better-convex-nuxt/composables`

## Auth Shape

- workspace membership
- roles: `owner`, `admin`, `instructor`, `student`
- staff bypass some guards
- students must be enrolled and satisfy lesson-level requirements

## Easy Problem

- an enrolled student can read a published lesson

## Hard Problem

- lesson access depends on the relationship chain: actor -> enrollment -> course state -> lesson state -> prerequisites -> time window

## Module Primitives Used

- `guard`, `can`, `deny`
- `createAuth` from `better-convex-nuxt/composables`
- `createTestContext`

## Files To Read First

1. `convex/auth/enrollment.ts`
2. `convex/auth/prerequisites.ts`
3. `convex/lessons.ts`
4. `pages/index.vue`
5. `convex/lms.test.ts`

## Run It

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

## Demo Flow

1. Sign up and create a workspace.
2. Seed the demo course as the owner or instructor.
3. Enroll as a student.
4. Try to open the advanced lesson before and after completing the prerequisite.

## Test Focus

- enrolled access
- missing enrollment denial
- prerequisite completion unlock
- prerequisite denial
- unpublished lesson denial
