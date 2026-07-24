import { chromium } from 'playwright'

import {
  INTERACTION_LAB_SESSIONS,
  INTERACTION_ORIGIN,
  INTERACTION_SESSION_COOKIE,
} from './fixture/convex/interaction_page_contract'

export interface InteractionBrowserProof {
  readonly finalStatus: string
  readonly requestMethods: readonly string[]
}

export interface InteractionBrowserProofOptions {
  readonly additionalSecretSentinels: readonly string[]
  readonly locator: string
  readonly siteUrl: string
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export async function proveInteractionBrowserBoundary(
  options: InteractionBrowserProofOptions,
): Promise<InteractionBrowserProof> {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext().catch(async (error: unknown) => {
    await browser.close()
    throw error
  })
  const page = await context.newPage().catch(async (error: unknown) => {
    await context.close()
    await browser.close()
    throw error
  })
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const failedRequests: Array<{ error: string; method: string; url: string }> = []
  const requestMethods: string[] = []
  const requestDiagnostics: Array<{ bodyBytes: number; method: string; origin: string | null }> = []
  const responseBodies: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('requestfailed', (request) =>
    failedRequests.push({
      error: request.failure()?.errorText ?? 'unknown',
      method: request.method(),
      url: request.url(),
    }),
  )

  try {
    await context.addCookies([
      {
        domain: 'notes.example.invalid',
        httpOnly: true,
        name: INTERACTION_SESSION_COOKIE,
        path: '/',
        sameSite: 'Strict',
        secure: true,
        value: INTERACTION_LAB_SESSIONS.alice,
      },
    ])
    await page.route(`${INTERACTION_ORIGIN}/**`, async (route) => {
      const browserRequest = route.request()
      const originalUrl = new URL(browserRequest.url())
      const upstreamUrl = new URL(`${originalUrl.pathname}${originalUrl.search}`, options.siteUrl)
      const headers = new Headers(browserRequest.headers())
      headers.delete('content-length')
      headers.delete('host')
      const browserOriginHeader = headers.get('origin')
      if (
        browserRequest.method() === 'POST' &&
        browserOriginHeader === 'null' &&
        originalUrl.origin === INTERACTION_ORIGIN
      ) {
        // Playwright gives intercepted documents an opaque initiator. Preserve the original fixed
        // browser origin while proxying the request to the local Convex deployment.
        headers.set('origin', originalUrl.origin)
      }
      const body =
        browserRequest.method() === 'GET' || browserRequest.method() === 'HEAD'
          ? undefined
          : (browserRequest.postData() ?? '')
      requestMethods.push(browserRequest.method())
      requestDiagnostics.push({
        bodyBytes: body === undefined ? 0 : Buffer.byteLength(body),
        method: browserRequest.method(),
        origin: browserOriginHeader,
      })
      const upstream = await fetch(upstreamUrl, {
        ...(body === undefined ? {} : { body }),
        headers,
        method: browserRequest.method(),
        redirect: 'manual',
      })
      const responseBody = Buffer.from(await upstream.arrayBuffer())
      responseBodies.push(responseBody.toString('utf8'))
      await route.fulfill({
        body: responseBody,
        headers: Object.fromEntries(upstream.headers),
        status: upstream.status,
      })
    })

    const interactionUrl = `${INTERACTION_ORIGIN}/interactions/${options.locator}`
    await page.goto(interactionUrl, { waitUntil: 'domcontentloaded' })
    assert(
      (await page.evaluate(() => location.origin)) === INTERACTION_ORIGIN,
      'The browser did not retain the fixed application origin',
    )
    assert(
      (await page.getByTestId('status').textContent()) === 'pending',
      'The production interaction page did not render the pending canonical state',
    )
    assert(
      (await page.getByTestId('effect').textContent()) === 'workspace_deleted: 1 note(s)',
      'The production interaction page did not render the exact application effect',
    )
    assert((await page.evaluate(() => document.referrer)) === '', 'The page received a referrer')
    assert(
      (await page.evaluate(() => document.cookie)) === '',
      'The HTTP-only application session became script-readable',
    )
    const pendingHtml = await page.locator('html').evaluate((element) => element.outerHTML)
    assert(!pendingHtml.includes(options.locator), 'The opaque locator was copied into page markup')

    const [confirmationResponse] = await Promise.all([
      page.waitForResponse(
        (response) => response.url() === interactionUrl && response.request().method() === 'POST',
      ),
      page.getByTestId('confirm').click(),
    ])
    assert(
      confirmationResponse.status() === 303,
      `Confirmation POST returned ${confirmationResponse.status()}: ${JSON.stringify({ requestDiagnostics, responseBodies })}`,
    )
    // Playwright route fulfillment does not follow a synthetic same-URL 303. Perform the canonical
    // GET explicitly; the direct HTTP proof separately verifies the exact Location header.
    await page.goto(interactionUrl, { waitUntil: 'domcontentloaded' })
    const finalStatus = (await page.getByTestId('status').textContent()) ?? ''
    assert(finalStatus === 'applied', `The explicit confirmation settled as ${finalStatus}`)
    assert((await page.getByTestId('confirm').count()) === 0, 'Applied operation stayed actionable')

    const finalHtml = await page.locator('html').evaluate((element) => element.outerHTML)
    const leakSurfaces = [
      pendingHtml,
      finalHtml,
      responseBodies.join('\n'),
      consoleErrors.join('\n'),
      pageErrors.join('\n'),
    ]
    for (const sentinel of [
      ...Object.values(INTERACTION_LAB_SESSIONS),
      ...options.additionalSecretSentinels,
    ]) {
      assert(
        leakSurfaces.every((surface) => !surface.includes(sentinel)),
        `Credential sentinel escaped into the interaction page: ${sentinel}`,
      )
    }
    assert(
      JSON.stringify(requestMethods) === JSON.stringify(['GET', 'POST', 'GET']),
      `Navigation performed unexpected requests: ${JSON.stringify(requestMethods)}`,
    )
    assert(
      consoleErrors.length === 0,
      `Unexpected browser console errors: ${consoleErrors.join('; ')}`,
    )
    assert(pageErrors.length === 0, `Unexpected browser errors: ${pageErrors.join('; ')}`)
    const unexpectedFailedRequests = failedRequests.filter(
      (request) =>
        !(
          request.url === interactionUrl &&
          ((request.method === 'POST' && request.error === 'net::ERR_ABORTED') ||
            (request.method === 'GET' && request.error === 'net::ERR_NAME_NOT_RESOLVED'))
        ),
    )
    assert(
      unexpectedFailedRequests.length === 0,
      `Unexpected browser request failures: ${JSON.stringify(unexpectedFailedRequests)}`,
    )

    return { finalStatus, requestMethods }
  } finally {
    await context.close()
    await browser.close()
  }
}
