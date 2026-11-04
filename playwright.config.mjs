// Браузерные тесты: npm run test:e2e. Сервер поднимается сам, в режиме MOCK (без ключей и сети).
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30000,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3210", browserName: "chromium", headless: true },
  webServer: {
    command: "node scripts/server.mjs",
    url: "http://127.0.0.1:3210/healthz",
    env: { PORT: "3210", AI_MODE: "mock", RATE_LIMIT_PER_MIN: "1000" },
    reuseExistingServer: false,
    timeout: 20000,
  },
});
