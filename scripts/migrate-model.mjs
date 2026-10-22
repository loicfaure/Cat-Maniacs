import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const entry = join(root, "..", "dist-electron", "migrate.cjs");
try {
  await access(entry);
} catch {
  process.stderr.write("Migration CLI is not bundled. Run npm run build first.\n");
  process.exit(4);
}
const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], { stdio: "inherit" });
child.on("error", (error) => {
  process.stderr.write(`Unable to start migration CLI: ${error.message}\n`);
  process.exitCode = 4;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 4 : 0);
});
