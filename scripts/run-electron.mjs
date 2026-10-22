import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const executable = process.env.ELECTRON_BINARY || require("electron");

if (!existsSync(executable)) {
  console.error(
    [
      "Aucun binaire Electron n'est disponible.",
      "Exécutez npm run electron:install pour installer la version du projet.",
      "Vérifiez ELECTRON_BINARY si vous utilisez un exécutable personnalisé.",
    ].join("\n"),
  );
  process.exit(1);
}

const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const launchArgs = process.env.CAT_DISPENSER_NO_SANDBOX === "1" ? ["--no-sandbox", "."] : ["."];
const child = spawn(executable, launchArgs, { stdio: "inherit", env: environment });
child.on("error", (error) => {
  console.error(`Impossible de lancer Electron : ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
