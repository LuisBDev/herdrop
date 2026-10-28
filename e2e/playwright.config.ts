import { defineConfig } from '@playwright/test';

const reuseExistingServer = !process.env.CI;

export default defineConfig({
  testDir: 'tests',
  globalSetup: './global-setup.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  use: { trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'bun fixtures/serve.ts fixtures/plain 4310',
      url: 'http://localhost:4310/index.html',
      reuseExistingServer,
    },
    {
      command: 'bun run --cwd fixtures/react dev',
      url: 'http://localhost:4311/',
      reuseExistingServer,
    },
    {
      command: 'bun run --cwd fixtures/angular start',
      url: 'http://localhost:4312/',
      timeout: 180_000,
      env: { NG_CLI_ANALYTICS: 'false' },
      reuseExistingServer,
    },
    {
      command:
        'bun run --cwd fixtures/angular build && bun fixtures/serve.ts fixtures/angular/dist/browser 4313',
      url: 'http://localhost:4313/',
      timeout: 180_000,
      env: { NG_CLI_ANALYTICS: 'false' },
      reuseExistingServer,
    },
  ],
});
