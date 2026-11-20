import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  
  root: resolve(import.meta.dirname, "src/renderer"),
   // .env files live at the project root, not in src/renderer
  envDir: import.meta.dirname,
  base: "./",
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true
  }
});

