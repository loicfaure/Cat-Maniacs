import { build as viteBuild } from "vite";
import { build } from "esbuild";

await Promise.all([
  build({
    entryPoints: ["src/main/main.ts"],
    outfile: "dist-electron/main.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    sourcemap: true
  }),
  build({
    entryPoints: ["src/preload/preload.ts"],
    outfile: "dist-electron/preload.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    sourcemap: true
  }),
  viteBuild({ configLoader: "runner" })
]);
