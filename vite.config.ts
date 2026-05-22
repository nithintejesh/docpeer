import { defineConfig } from "vite";

export default defineConfig({
  root: "src/client",
  server: {
    port: 5180,
    proxy: {
      "/api": "http://localhost:3500",
      "/ws": {
        target: "ws://localhost:3500",
        ws: true,
      },
    },
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
});
