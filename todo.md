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
