email pattern: Hmm, let me think about this honestly before jumping into API design.

The question is whether email belongs in your module's scope at all. Let me work through that.

## Where email touches your module

Email in a Convex + Nuxt app typically happens in one of two places:

**Convex actions.** You write a Convex action that calls Resend/Brevo/SendGrid. This runs inside the Convex runtime. Your module doesn't touch Convex function internals — that's their code, their runtime, their API keys.

**Nitro server routes.** You write a Nuxt server route that sends email. This runs in your Nuxt server. Your module _does_ own server-side DX via `serverConvexMutation`, `defineConvexHandler`, etc.

But here's the thing... the actual email sending is just a fetch call to an API. Resend's SDK is 4 lines. Brevo's is similar. The "hard part" of email isn't sending — it's templates, queuing, tracking, bounce handling. None of that is your module's territory.

So the real question is: **is there a seam between Convex/Nuxt and email that your module should remove?**

## Where a seam actually exists

There is one pattern that comes up constantly and is genuinely annoying:

A mutation happens (user signs up, order placed, comment posted) → you need to send an email → but you can't call an external API from a Convex mutation (mutations are deterministic) → so you schedule a Convex action → the action calls the email API → if it fails you need to handle retries.

That mutation → action → external API chain is the real pain point. And your module already sits at the junction — `useConvexMutation` triggers the mutation, the Convex backend schedules the action, the action calls the email service.

But your module can't simplify that chain because it happens entirely inside the Convex runtime. You'd need to change how people write their Convex functions, which is out of scope.

The other place email shows up on the Nuxt side is **transactional email triggered from server routes** — password reset, invite links, verification codes. These typically go through Better Auth, which already handles its own email sending. Your auth proxy forwards these requests. You're already in the chain, you just don't need to touch the email part.

## What email sugar could look like (if you did it)

If I'm being creative about it, here's what would actually save time:

```ts
// nuxt.config.ts
convex: {
  email: {
    provider: 'resend',
    from: 'app@example.com',
  },
}

// server/api/invite.post.ts
export default defineEventHandler(async (event) => {
  const { email, teamName } = await readValidatedBody(event, validateConvexArgs(v.object({
    email: v.string(),
    teamName: v.string(),
  })))

  await sendConvexEmail({
    to: email,
    subject: `You're invited to ${teamName}`,
    html: `<p>Click <a href="${inviteUrl}">here</a> to join.</p>`,
  })

  return { sent: true }
})
```

Or even tighter with a Convex action hook:

```ts
// After a mutation succeeds, send an email
const inviteUser = useConvexMutation(api.teams.invite, {
  onSuccess: async (result, args) => {
    await $fetch("/api/send-invite", {
      method: "POST",
      body: { email: args.email, inviteId: result.inviteId },
    });
  },
});
```

But look at what `sendConvexEmail` would actually be:

```ts
export async function sendConvexEmail(options: EmailOptions) {
  const config = useRuntimeConfig();
  const provider = config.convex.email.provider;

  if (provider === "resend") {
    return await $fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.resendApiKey}` },
      body: {
        from: config.convex.email.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
      },
    });
  }

  if (provider === "brevo") {
    // similar fetch call
  }
}
```

That's... a fetch wrapper with a config switch. It's not solving a Convex-Nuxt seam problem. It's solving a "I don't want to write 5 lines of fetch" problem. And there are already excellent packages for that — `resend` (npm), `@brevo/sdk`, or even Nuxt modules like `nuxt-resend`.

## My honest recommendation

**Don't do it.**

Here's why:

**It's not a seam problem.** Your module removes the seam between Nuxt and Convex. Email is a third-party service that connects to either side independently. There's no Nuxt↔Convex integration pain that email sugar would solve.

**The SDKs are already tiny.** Resend's SDK is one function call. Brevo's is similar. You'd be wrapping a wrapper.

**Provider maintenance is a trap.** The moment you support Resend and Brevo, someone asks for SendGrid. Then Postmark. Then AWS SES. Then Mailgun. Each provider has different APIs, different auth patterns, different response shapes. You're now maintaining email provider adapters forever.

**It dilutes your identity.** Your module is "the Convex bridge for Nuxt." Adding email makes it "the Convex bridge for Nuxt that also sends email." That "also" is where module scope starts to rot. Today it's email, tomorrow it's payments, next month it's push notifications.

**Better Auth already handles auth emails.** Password reset, email verification, magic links — the emails that are actually part of the auth flow go through Better Auth. Your auth proxy already facilitates this. Adding a separate email layer would create confusion about which email system to use for what.

## What I'd do instead

Document the pattern. In your docs, show a clear example:

```ts
// convex/emails.ts — Convex action that sends email
import { Resend } from "resend";

export const sendInvite = action({
  args: { email: v.string(), inviteId: v.id("invites") },
  handler: async (ctx, { email, inviteId }) => {
    const invite = await ctx.runQuery(api.invites.get, { id: inviteId });
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "app@example.com",
      to: email,
      subject: `You're invited to ${invite.teamName}`,
      html: `<p>Join here: ${invite.url}</p>`,
    });
  },
});
```

```ts
// In your Vue component — trigger it via useConvexAction
const sendInvite = useConvexAction(api.emails.sendInvite);
await sendInvite({ email: "user@example.com", inviteId });
```

That's the Convex way to do email. The action runs server-side, has access to your database, and your module's `useConvexAction` handles the client-side state (pending, error, success). No email abstraction needed — the Convex action _is_ the abstraction.

If someone wants to send email from a Nitro route instead, they use Resend's SDK directly. 4 lines. No module sugar needed.

**Stay in your lane. Own the seam. Let email be someone else's problem.**

---

Tests:

Alright, I've spent a good while going through your test suite, and honestly? It's pretty impressive overall. But let me give you the real talk — the good, the rough edges, and where I think you're spending effort that isn't paying off.

**What's genuinely strong here**

Your test architecture is well-thought-out. The four-tier split (unit → nuxt runtime → browser → e2e) makes sense for this kind of module, and you're mostly putting tests in the right tier. The `captureInNuxt` harness is clever — it lets you test composables in a real-ish Nuxt context without spinning up a full app for every test. That's hard to get right and you nailed it.

The `MockConvexClient` is solid. It supports targeted emission by path, by args, or by predicate, which means your tests can be precise about what they're verifying. The `emitQueryResultWhere` pattern is especially nice for paginated query tests where you need to match on cursor values.

Your error handling tests are genuinely thorough. The `call-result-categories.test.ts` file covers the full categorization matrix — code-based, status-based, precedence, edge cases. The `ConvexCallError` integration tests verify that auto-derivation actually works end-to-end. This is the kind of testing that prevents real bugs.

The paginated query test suite is probably the crown jewel. Walking the full status machine (`loading-first-page → ready → loading-more → exhausted`), testing refresh recovery from errors, reset with new pagination IDs, `keepPreviousData` stale detection... that's covering real user scenarios that would be painful to debug in production.

**Where things get bloated**

The `define-convex-tool.test.ts` file is 450+ lines and it's testing... basically the entire MCP tool pipeline in one file. Auth, permissions, destructive confirmation, preview, rate limiting, middleware, input schema conversion, annotations — all in one place. Each of those is a distinct concern. The file reads like integration test soup. You'd get more signal by splitting this into focused files per feature.

The `useConvexUploadQueue.nuxt.test.ts` with its `FakeQueueXhr` class is doing a lot of heavy lifting. You're essentially reimplementing XHR behavior to test upload queue semantics. That fake is complex enough to have bugs of its own. I'd consider whether the queue scheduling logic could be extracted and tested without the XHR simulation layer.

**Tests that feel like they're testing the test infrastructure**

`module-auto-imports.test.ts` is reading the module source file as a string and regex-matching for import names. If you rename an import, this test tells you... that you renamed an import. The module itself would fail to build if imports were wrong. This is testing the build system's job.

`package-subpath-exports.test.ts` — same energy. Reading `package.json` and checking that keys exist. Your CI build would catch a broken subpath export instantly.

`server-index-exports.test.ts` and `mcp-index-exports.test.ts` — importing a module and checking `toHaveProperty` on every export. These are basically snapshot tests of your public API surface, but without the benefit of actually _using_ those exports. They'll pass even if the exports are completely broken internally.

**Duplication I noticed**

The `global-hooks.test.ts` (unit) and `global-hooks.nuxt.test.ts` (nuxt runtime) overlap significantly. The unit tests mock everything and verify hook payloads. The nuxt tests do the same thing but with a real-ish Nuxt context. The unit versions are faster but the nuxt versions are more trustworthy. Pick one — I'd keep the nuxt versions and drop the unit mocks.

`optimistic-updates.test.ts` tests the builder API exhaustively with a `FakeOptimisticLocalStore`, which is great. But then `useConvexMutation.nuxt.test.ts` also tests optimistic updates implicitly through the mutation flow. The overlap isn't terrible, but it's worth being aware of.

**Tests that are genuinely catching real bugs**

`query-status.test.ts` — the comment says this was added after bug #7 (`undefined !== null` causing false error status). This is exactly the kind of regression test that earns its keep. Short, targeted, documents the bug it prevents.

`auth-pending.test.ts` — testing timeout behavior with fake timers. Simple, focused, tests a real race condition.

The `devtools-useBridge-instance.test.ts` testing that responses from non-bound instances are ignored — that's preventing cross-tab interference bugs that would be miserable to debug in production.

**What I'd actually change**

Drop the "does this export exist" tests. They're noise. If you want API surface protection, use a `.d.ts` snapshot or TypeScript's own `--declaration` output.

Merge the unit and nuxt runtime versions of global hooks — keep the nuxt ones, they're more trustworthy.

Split `define-convex-tool.test.ts` into per-feature files (auth, permissions, destructive flow, rate limiting, middleware).

Consider whether the e2e tests are worth their CI cost. The `auth-loop.e2e.test.ts` requires a running Convex backend, Better Auth setup, correct env vars... that's a lot of moving parts for what amounts to "can I click between signin and signup." If this breaks, you'd notice in manual testing within 30 seconds.

**The bottom line**

Your test suite is above average — probably top 20% of open source Nuxt modules I've seen. The core composable tests are strong, error handling coverage is excellent, and the paginated query tests are genuinely impressive. The main issue isn't quality, it's density — there's probably 15-20% of test code that's either duplicated across tiers or testing things the build system already guarantees. Trimming that would make the suite faster and easier to maintain without losing any real coverage.
