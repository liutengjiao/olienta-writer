import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev:tauri',
    url: 'http://localhost:1420',
    reuseExistingServer: true,
    timeout: 20_000,
  },
  projects: [
    {
      name: 'edge',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'msedge',
      },
    },
  ],
})
