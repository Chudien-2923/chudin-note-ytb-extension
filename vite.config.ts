import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  build: {
    target: "chrome116",
    cssTarget: "chrome116",
    sourcemap: false,
    assetsInlineLimit: 0,
    rolldownOptions: {
      input: {
        sidepanel: fileURLToPath(new URL("./sidepanel.html", import.meta.url)),
        notebook: fileURLToPath(new URL("./notebook.html", import.meta.url)),
        "service-worker": fileURLToPath(
          new URL("./src/background/index.ts", import.meta.url),
        ),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
