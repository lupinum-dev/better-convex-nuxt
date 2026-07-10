// Proof 7 supplement: document the exact undici/global-fetch behaviors the
// redirect guarantee rests on. Establishes the Phase 4 implementation contract.
//
// Findings this pins (node global fetch = undici):
//   - redirect:'error'  -> throws TypeError("unexpected redirect") BEFORE the
//     redirect is followed; the target receives zero requests.
//   - redirect:'follow' -> SAME-origin: Cookie IS preserved -> credential leaks
//     to the target. This is why redirect:'error' is mandatory even same-origin.
//   - redirect:'follow' -> CROSS-origin: undici additionally strips Cookie/Authorization
//     (defense in depth), but we do NOT rely on this — redirect:'error' is the guarantee.
//   - redirect:'manual' -> does NOT follow (target gets zero requests).
import http from 'node:http'

const UP = 4657
const XREC = 4658
const COOKIE = 'session=LEAKME_SECRET'

const s = { same: 0, sameCookie: 0, cross: 0, crossCookie: 0 }

// Upstream also hosts the SAME-origin recorder at /same-recorder.
const upstream = http.createServer((req, res) => {
  if (req.url === '/redirect-cross') {
    res.writeHead(307, { Location: `http://127.0.0.1:${XREC}/recorder` })
    res.end()
    return
  }
  if (req.url === '/redirect-same') {
    res.writeHead(307, { Location: `http://127.0.0.1:${UP}/same-recorder` })
    res.end()
    return
  }
  if (req.url === '/same-recorder') {
    s.same++
    if (req.headers.cookie) s.sameCookie++
    res.writeHead(200).end('ok')
    return
  }
  res.writeHead(404).end()
})
const xrecorder = http.createServer((req, res) => {
  s.cross++
  if (req.headers.cookie) s.crossCookie++
  res.writeHead(200).end('ok')
})
const listen = (srv, p) => new Promise((r) => srv.listen(p, '127.0.0.1', () => r()))

async function main() {
  await listen(upstream, UP)
  await listen(xrecorder, XREC)
  const base = `http://127.0.0.1:${UP}`

  // A) redirect:'error' on a same-origin redirect — capture exact thrown cause.
  let threw = false,
    errType = '',
    cause = ''
  const beforeA = { ...s }
  try {
    await fetch(`${base}/redirect-same`, { headers: { Cookie: COOKIE }, redirect: 'error' })
  } catch (e) {
    threw = true
    errType = e?.constructor?.name
    cause = (e?.cause?.message || e?.message || '').slice(0, 80)
  }
  const errSameHits = s.same - beforeA.same

  // B) redirect:'follow' SAME-origin — the genuine leak-control.
  const beforeB = { ...s }
  await fetch(`${base}/redirect-same`, { headers: { Cookie: COOKIE }, redirect: 'follow' }).catch(
    () => {},
  )
  const followSameHits = s.same - beforeB.same
  const followSameCookie = s.sameCookie - beforeB.sameCookie

  // C) redirect:'follow' CROSS-origin — undici extra safety (Cookie stripped).
  const beforeC = { ...s }
  await fetch(`${base}/redirect-cross`, { headers: { Cookie: COOKIE }, redirect: 'follow' }).catch(
    () => {},
  )
  const followCrossHits = s.cross - beforeC.cross
  const followCrossCookie = s.crossCookie - beforeC.crossCookie

  // D) redirect:'manual' — does not follow.
  const beforeD = { ...s }
  await fetch(`${base}/redirect-same`, { headers: { Cookie: COOKIE }, redirect: 'manual' }).catch(
    () => {},
  )
  const manualSameHits = s.same - beforeD.same

  console.log(
    `=== PROOF 7 SUPPLEMENT: undici fetch redirect behavior (node ${process.version}) ===\n`,
  )
  console.log(
    `A) redirect:'error'  -> threw=${threw} type=${errType} cause="${cause}"; same-origin target hits=${errSameHits} (expect 0)`,
  )
  console.log(
    `B) redirect:'follow' SAME-origin  -> target hits=${followSameHits}, target saw Cookie=${followSameCookie}  <== LEAK proves 'error' is required`,
  )
  console.log(
    `C) redirect:'follow' CROSS-origin -> target hits=${followCrossHits}, target saw Cookie=${followCrossCookie}  (undici strips Cookie cross-origin; not relied upon)`,
  )
  console.log(
    `D) redirect:'manual' -> same-origin target hits=${manualSameHits} (expect 0; does not follow)`,
  )

  const pass =
    threw &&
    errType === 'TypeError' &&
    /redirect/i.test(cause) &&
    errSameHits === 0 &&
    followSameHits === 1 &&
    followSameCookie === 1 && // credential leaks same-origin under 'follow'
    followCrossHits === 1 &&
    followCrossCookie === 0 && // undici strips cookie cross-origin
    manualSameHits === 0

  console.log(`\nSUPPLEMENT VERDICT: ${pass ? 'PASS' : 'FAIL'}`)
  upstream.close()
  xrecorder.close()
  process.exit(pass ? 0 : 1)
}
main()
