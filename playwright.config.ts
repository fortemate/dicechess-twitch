import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  use: { browserName: 'chromium', viewport: { width: 1920, height: 1080 } },
  webServer: {
    command: 'npm run build && npm start',
    url: 'http://127.0.0.1:4310',
    reuseExistingServer: false,
  },
});
