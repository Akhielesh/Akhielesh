import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const apiTarget = process.env.ADMINAK_API ?? "http://127.0.0.1:8787";

export default defineConfig({
  root: "web",
  publicDir: "public",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)) },
  },
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": apiTarget,
      "/calendar": apiTarget,
      "/healthz": apiTarget,
    },
  },
});
