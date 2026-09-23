import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Keep unit tests independent of the application's SSR/build plugins.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    pool: "threads",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
