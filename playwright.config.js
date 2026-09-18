// playwright.config.js
// Remplace about_panel.test.js / mobile_css_layout.test.js / sub_panel_toggles.test.js
// par des tests exécutés dans un vrai Chromium (nécessaire pour AudioContext + Canvas réels).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Les tests AudioContext/WebAudio sont sensibles au parallélisme
  // (un seul contexte audio "réel" à la fois évite les faux négatifs de timing).
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Chrome bloque l'audio sans interaction : on laisse le test
    // déclencher lui-même le premier geste utilisateur (voir playback.spec.js)
    // plutôt que de désactiver la politique via --autoplay-policy, pour
    // reproduire fidèlement le bug "AudioContext was not allowed to start".
  },

  webServer: {
    // TODO: adapter si la commande Vite du repo diffère (ex: "vite --port 3000")
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
      // Remplace mobile_css_layout.test.js : vrai viewport + touch events,
      // pas une simulation de media query.
      use: { ...devices['Pixel 7'] },
      testMatch: /.*\.mobile\.spec\.js/,
    },
  ],
});
