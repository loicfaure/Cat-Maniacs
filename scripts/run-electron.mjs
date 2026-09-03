import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const executableName = process.platform === "win32" ? "electron.exe" : "electron";
const candidates = [
  process.env.ELECTRON_BINARY,
  resolve("node_modules/electron/dist", executableName)
].filter(Boolean);
const executable = candidates.find((candidate) => existsSync(candidate));

if (!executable) {
  console.error([
    "Aucun binaire Electron n'est disponible.",
    "Les scripts d'installation npm sont désactivés volontairement dans .npmrc.",
    "Définissez ELECTRON_BINARY vers un binaire Electron 43 déjà installé."
  ].join("\n"));
  process.exit(1);
}

const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, ["."], { stdio: "inherit", env: environment });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
