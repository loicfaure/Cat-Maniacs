import { build } from "esbuild";
import { build as viteBuild } from "vite";
import { loadEnv } from "vite";

const mode = process.env.NODE_ENV === "production" ? "production" : "development";
const env = loadEnv(mode, process.cwd(), "VITE_");

const define = {
  "import.meta.env.DEV": JSON.stringify(mode === "development"),
  "import.meta.env.VITE_FIREBASE_API_KEY": JSON.stringify(env.VITE_FIREBASE_API_KEY),
  "import.meta.env.VITE_FIREBASE_AUTH_DOMAIN": JSON.stringify(env.VITE_FIREBASE_AUTH_DOMAIN),
  "import.meta.env.VITE_FIREBASE_PROJECT_ID": JSON.stringify(env.VITE_FIREBASE_PROJECT_ID),
  "import.meta.env.VITE_FIREBASE_STORAGE_BUCKET": JSON.stringify(env.VITE_FIREBASE_STORAGE_BUCKET),
  "import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID": JSON.stringify(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  "import.meta.env.VITE_FIREBASE_APP_ID": JSON.stringify(env.VITE_FIREBASE_APP_ID),
  "import.meta.env.VITE_FIREBASE_MEASUREMENT_ID": JSON.stringify(env.VITE_FIREBASE_MEASUREMENT_ID),
  "import.meta.env.VITE_GOOGLE_CLIENT_ID": JSON.stringify(env.VITE_GOOGLE_CLIENT_ID),
  "import.meta.env.VITE_GOOGLE_CLIENT_SECRET": JSON.stringify(env.VITE_GOOGLE_CLIENT_SECRET),
};

await Promise.all([
  build({
    entryPoints: ["src/main/main.ts"],
    outfile: "dist-electron/main.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    sourcemap: true,
    define,
  }),
  build({
    entryPoints: ["src/preload/preload.ts"],
    outfile: "dist-electron/preload.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    sourcemap: true,
  }),
  build({
    entryPoints: ["src/migrationCliEntry.ts"],
    outfile: "dist-electron/migrate.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    sourcemap: true,
  }),
  viteBuild({ configLoader: "runner" }),
]);
