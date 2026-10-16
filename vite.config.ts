import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const mobileHost = loadEnv(mode, ".", "").TAURI_DEV_HOST;
  return ({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: mobileHost || false,
    port: 1420,
    strictPort: true,
    hmr: mobileHost ? { protocol: "ws", host: mobileHost, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/app/test/setup.ts"],
    css: true,
  },
  });
});
