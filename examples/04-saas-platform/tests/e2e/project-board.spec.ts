import { expect, test } from '@playwright/test'

async function signUp(page: import('@playwright/test').Page, name: string, email: string) {
  await page.goto('/')
  await page.getByTestId('signup-name').fill(name)
  await page.getByTestId('signup-email').fill(email)
  await page.getByTestId('signup-password').fill('password123')
  await page.getByTestId('signup-submit').click()
}

test('owner flow covers project, board, task detail, upload, and export', async ({ page }) => {
  await signUp(page, 'Owner', `owner-${Date.now()}@example.com`)

  await page.getByTestId('workspace-name').fill('Alpha')
  await page.getByTestId('workspace-slug').fill(`alpha-${Date.now()}`)
  await page.getByTestId('workspace-submit').click()

  await page.getByTestId('project-name').fill('Launch board')
  await page.getByTestId('project-submit').click()

  const projectLink = page.locator('[data-testid^="project-link-"]').first()
  await projectLink.click()

  await page.getByTestId('task-title').fill('Ship board')
  await page.getByTestId('task-submit').click()

  const moveButton = page.locator('[data-testid^="task-move-"]').first()
  await expect(moveButton).toBeVisible()
  await moveButton.click()

  const taskLink = page.locator('[data-testid^="task-link-"]').first()
  await taskLink.click()

  await page.getByTestId('comment-body').fill('Uploaded a supporting file.')
  await page.getByTestId('attachment-input').setInputFiles({
    name: 'note.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('project board attachment'),
  })
  await page.getByTestId('comment-submit').click()

  const exportPromise = page.waitForResponse(
    (response) => response.url().includes('/api/export') && response.status() === 200,
  )
  await page.getByRole('link', { name: '← Back to board' }).click()
  await page.getByRole('link', { name: 'Export CSV' }).click()
  await exportPromise
})
