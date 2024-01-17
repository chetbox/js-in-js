import { defineConfig } from "vite";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  base: "./",
  plugins: [topLevelAwait()],
  optimizeDeps: {
    exclude: ["quickjs-emscripten"], // workaround for Vite hosting .wasm files with wrong mimetype
  },
});
