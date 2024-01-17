import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["quickjs-emscripten"], // workaround for Vite hosting .wasm files with wrong mimetype
  },
});
