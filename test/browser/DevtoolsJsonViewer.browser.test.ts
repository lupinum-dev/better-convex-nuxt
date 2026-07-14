import { expect, test } from 'vitest'
import { render } from 'vitest-browser-vue'

import JsonViewer from '../../src/runtime/devtools/ui/components/JsonViewer.vue'

test('<JsonViewer> renders attacker-controlled strings as text, never markup', () => {
  const payload = '<img src=x onerror=globalThis.__jsonViewerXss=true>'
  render(JsonViewer, {
    props: { data: { payload } },
  })

  const viewer = document.querySelector('.json-viewer')
  expect(viewer?.textContent).toContain(payload)
  expect(viewer?.querySelector('img')).toBeNull()
  expect((globalThis as { __jsonViewerXss?: boolean }).__jsonViewerXss).not.toBe(true)
})
