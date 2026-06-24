type EmailContent = {
  html: string
  subject: string
  text: string
}

function isLocalEmailFallbackAllowed(siteUrl: string) {
  return (
    siteUrl.startsWith('http://localhost') ||
    siteUrl.startsWith('http://127.0.0.1') ||
    process.env.ALLOW_TEST_RESET === 'true'
  )
}

async function sendResendEmail(recipient: string, content: EmailContent) {
  const from = process.env.RESEND_FROM_EMAIL
  const apiKey = process.env.RESEND_API_KEY

  if (!from || !apiKey) {
    throw new Error('Resend email delivery is not configured')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject: content.subject,
      text: content.text,
      html: content.html,
    }),
  })

  if (!response.ok) {
    throw new Error(`Email delivery failed: ${response.status} ${response.statusText}`)
  }
}

export async function sendStarterEmail(args: {
  recipient: string
  siteUrl: string
  fallbackLabel: string
  fallbackUrl: string
  content: EmailContent
}) {
  const { recipient, siteUrl, fallbackLabel, fallbackUrl, content } = args

  if (!process.env.RESEND_FROM_EMAIL || !process.env.RESEND_API_KEY) {
    if (!isLocalEmailFallbackAllowed(siteUrl)) {
      throw new Error(`${fallbackLabel} delivery is not configured`)
    }

    console.info(`[team-starter] ${fallbackLabel} ${recipient}: ${fallbackUrl}`)
    return
  }

  await sendResendEmail(recipient, content)
}
