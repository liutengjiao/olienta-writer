import { expect, test } from '@playwright/test'

test('browser preview opens the sample project and exposes writing surfaces', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('Olienta Writer').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: '项目列表' })).toBeVisible()

  await page.getByRole('button', { name: '无痛剥离', exact: true }).click()

  await expect(page.getByText('无痛剥离').first()).toBeVisible()
  await page.getByRole('button', { name: /MS Manuscript/ }).click()
  await expect(page.getByText('第一章').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Manuscript' })).toBeVisible()
  await expect(page.getByText('当前为示例预览只读项目').first()).toBeVisible()
  await expect(page.locator('.markdown-rendered').first()).toBeVisible()
})
