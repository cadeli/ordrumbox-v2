// playwright.config.js
// Replaces about_panel.test.js / mobile_css_layout.test.js / sub_panel_toggles.test.js
// with tests running in real Chromium (required for real AudioContext + Canvas).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // AudioContext/WebAudio tests are sensitive to parallelism
  // (a single real audio context at a time avoids false timing negatives).
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Chrome blocks audio without interaction: we let the test
    // trigger the first user gesture itself (see playback.spec.js)
    // rather than disabling the policy via --autoplay-policy, to
    // faithfully reproduce the "AudioContext was not allowed to start" bug.
  },

  webServer: {
    // TODO: adapt if the Vite command in this repo differs (e.g. "vite --port 3000")
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /^(?!.*\.mobile\.)/,
    },
    {
      name: 'mobile-chromium',
      // Replaces mobile_css_layout.test.js: real viewport + touch events,
      // not a media query simulation.
      use: { ...devices['Pixel 7'] },
      testMatch: /.*\.mobile\.spec\.js/,
    },
  ],
});
