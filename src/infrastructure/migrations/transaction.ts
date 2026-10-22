import { createHash, randomUUID } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { SCHEMA_3_TABLES, SCHEMA_7_TABLES } from "../../legacy/migration/legacyFormat";
import { TABLES } from "../database/tables";

export interface StagedMigrationFile {
  name: string;
  content: string;
  manifest?: boolean;
}
export interface MigrationReceipt {
  migrationId: string;
  sourceSchema: number;
  targetSchema: 8;
  backupPath: string;
  completedAt: string;
  counts: Record<string, number>;
}

const JOURNAL = ".model-migration-transaction.json";
const LOCK = ".model-migration.lock";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENT_TARGETS = new Set([...TABLES.map((table) => table.file), "dataset.json"]);
const LEGACY_TARGETS = new Set([
  ...SCHEMA_3_TABLES.map((table) => table.file),
  ...SCHEMA_7_TABLES.map((table) => table.file),
  "dataset.json",
]);
const RETIRED_TARGETS = new Set(["cats.csv", "cat_events.csv", "adoption_day_cats.csv"]);

/** Creates and verifies a complete immutable backup, then publishes staged
 * files with the target manifest last. Callers must validate staged contents
 * before invoking this function. */
export async function commitMigration(options: {
  directory: string;
  sourceSchema: number;
  files?: readonly StagedMigrationFile[];
  retiredFiles: readonly string[];
  counts?: Record<string, number>;
  prepare?: () => Promise<{
    files: readonly StagedMigrationFile[];
    counts: Record<string, number>;
  }>;
  validateStaged: (stagingDirectory: string) => Promise<void>;
}): Promise<MigrationReceipt> {
  const directory = resolve(options.directory);
  const id = randomUUID();
  const lockPath = join(directory, LOCK);
  try {
    await writeFile(
      lockPath,
      JSON.stringify({ id, pid: process.pid, startedAt: new Date().toISOString() }),
      { flag: "wx" },
    );
  } catch (error) {
    if (!(await exists(lockPath))) {
      throw error;
    }
    let owner = "propriétaire inconnu";
    try {
      const parsed: unknown = JSON.parse(await readFile(lockPath, "utf8"));
      if (isRecord(parsed)) {
        owner = `PID ${typeof parsed.pid === "number" ? parsed.pid : "inconnu"}, démarré ${typeof parsed.startedAt === "string" ? parsed.startedAt : "à une date inconnue"}`;
      }
    } catch {
      owner = "verrou illisible";
    }
    throw new Error(
      `Jeu de données verrouillé (${owner}). Vérifiez le processus avant de libérer un verrou périmé.`,
    );
  }
  let backupPath = "";
  const stagePath = join(directory, `.model-v1-stage-${id}`);
  try {
    backupPath = backupLocation(directory, id);
    await createVerifiedBackup(directory, id);
    await recoverLegacyTransaction(directory);
    const prepared = options.prepare
      ? await options.prepare()
      : {
          files: options.files ?? [],
          counts: options.counts ?? {},
        };
    await mkdir(stagePath, { recursive: true });
    const files = prepared.files.map((file) => ({ ...file, name: checkedBasename(file.name) }));
    const names = new Set<string>();
    if (
      files.filter((file) => file.manifest).length !== 1 ||
      files.some((file) => {
        const invalid =
          !CURRENT_TARGETS.has(file.name) ||
          Boolean(file.manifest) !== (file.name === "dataset.json") ||
          names.has(file.name);
        names.add(file.name);
        return invalid;
      })
    ) {
      throw new Error("La transaction doit publier exactement un manifeste et des cibles valides.");
    }
    if (options.retiredFiles.some((file) => !RETIRED_TARGETS.has(file))) {
      throw new Error("La transaction contient un fichier historique à retirer inattendu.");
    }
    for (const file of files) {
      await writeFile(join(stagePath, file.name), file.content, { encoding: "utf8", flag: "wx" });
    }
    await options.validateStaged(stagePath);

    const operations = files.map((file) => ({
      temporary: join(directory, `.${file.name}.${id}.migration-tmp`),
      target: file.name,
      manifest: Boolean(file.manifest),
    }));
    for (const operation of operations) {
      await rename(join(stagePath, basename(operation.target)), operation.temporary);
    }
    const journal = {
      id,
      directory: basename(directory),
      files: operations.map(({ temporary, target, manifest }) => ({
        temporary: basename(temporary),
        target,
        manifest,
      })),
      retiredFiles: options.retiredFiles.map(checkedBasename),
      receipt: {
        migrationId: id,
        sourceSchema: options.sourceSchema,
        targetSchema: 8 as const,
        backupPath,
        completedAt: new Date().toISOString(),
        counts: prepared.counts,
      },
    };
    await writeFile(join(directory, JOURNAL), JSON.stringify(journal, null, 2));
    await finishJournal(directory, journal);
    await rm(lockPath, { force: true });
    return journal.receipt;
  } catch (error) {
    await rm(stagePath, { recursive: true, force: true });
    // Preserve lock and journal on interrupted publication so the next open
    // can recover deterministically and report who held the dataset.
    if (!(await exists(join(directory, JOURNAL)))) {
      await rm(lockPath, { force: true });
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Migration annulée. Sauvegarde : ${backupPath || "non créée"}. ${detail}`);
  }
}

async function recoverLegacyTransaction(directory: string): Promise<void> {
  const journalPath = join(directory, ".transaction.json");
  if (!(await exists(journalPath))) {
    return;
  }
  const parsed: unknown = JSON.parse(await readFile(journalPath, "utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed.files)) {
    throw new Error(
      "Le journal historique est invalide; consultez la sauvegarde avant toute récupération.",
    );
  }
  if (typeof parsed.id !== "string" || !UUID.test(parsed.id)) {
    throw new Error("Le journal historique ne contient pas un identifiant de transaction valide.");
  }
  const root = resolve(directory);
  const operations = parsed.files.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.temporary !== "string" ||
      typeof entry.target !== "string"
    ) {
      throw new Error("Le journal historique contient une opération invalide.");
    }
    const temporary = resolve(entry.temporary);
    const target = resolve(entry.target);
    if (dirname(temporary) !== root || dirname(target) !== root) {
      throw new Error(
        "Le journal historique pointe hors du jeu de données; aucune récupération n'a été appliquée.",
      );
    }
    const targetName = basename(target);
    const temporaryName = basename(temporary);
    if (!LEGACY_TARGETS.has(targetName) || temporaryName !== `${targetName}.${parsed.id}.tmp`) {
      throw new Error("Le journal historique contient une cible ou un temporaire inattendu.");
    }
    return { temporary, target };
  });
  for (const operation of operations) {
    if (await exists(operation.temporary)) {
      await rename(operation.temporary, operation.target);
    } else if (!(await exists(operation.target))) {
      throw new Error(
        `Récupération historique impossible : ${basename(operation.target)} est absent.`,
      );
    }
  }
  await rm(journalPath, { force: true });
}

/** Completes only a journal stored in this dataset, with every path constrained
 * to a single filename in the dataset directory. */
export async function recoverMigration(directory: string): Promise<"none" | "recovered"> {
  const root = resolve(directory);
  const journalPath = join(root, JOURNAL);
  if (!(await exists(journalPath))) {
    return "none";
  }
  await assertNoLiveMigrationOwner(root);
  const journal: unknown = JSON.parse(await readFile(journalPath, "utf8"));
  if (!isRecord(journal) || !Array.isArray(journal.files) || !Array.isArray(journal.retiredFiles)) {
    throw new Error(
      "Le journal de migration est invalide; le dossier reste verrouillé pour éviter une perte de données.",
    );
  }
  await finishJournal(root, journal);
  await rm(join(root, LOCK), { force: true });
  return "recovered";
}

/** Called before CLI inspection. An interrupted journal represents an earlier
 * user-approved migration, so a dead owner's journal can be completed safely. */
export async function recoverStaleMigrationBeforeInspection(directory: string): Promise<void> {
  const root = resolve(directory);
  const lockPath = join(root, LOCK);
  const hasJournal = await exists(join(root, JOURNAL));
  if (!(await exists(lockPath))) {
    if (hasJournal) {
      await recoverMigration(root);
    }
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(lockPath, "utf8"));
  } catch {
    throw new Error(
      "Le verrou de migration est illisible; inspection arrêtée pour protéger le registre.",
    );
  }
  if (!isRecord(parsed) || typeof parsed.pid !== "number" || !Number.isInteger(parsed.pid)) {
    throw new Error(
      "Le verrou de migration ne contient pas de propriétaire valide; inspection arrêtée.",
    );
  }
  if (processIsAlive(parsed.pid)) {
    throw new Error(
      `Une migration est en cours dans le processus ${parsed.pid}; inspection arrêtée.`,
    );
  }
  if (!hasJournal) {
    throw new Error(
      `Le verrou de migration du processus ${parsed.pid} est périmé sans journal. Utilisez --recover-lock après vérification.`,
    );
  }
  await recoverMigration(root);
}

/** Read-only counterpart used by dry-run, which must never recover or write. */
export async function checkMigrationRecovery(
  directory: string,
): Promise<"ready" | "recovery-required"> {
  const root = resolve(directory);
  const lockPath = join(root, LOCK);
  const hasJournal = await exists(join(root, JOURNAL));
  if (!(await exists(lockPath))) {
    return hasJournal ? "recovery-required" : "ready";
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(lockPath, "utf8"));
  } catch {
    throw new Error(
      "Le verrou de migration est illisible; inspection arrêtée pour protéger le registre.",
    );
  }
  if (!isRecord(parsed) || typeof parsed.pid !== "number" || !Number.isInteger(parsed.pid)) {
    throw new Error(
      "Le verrou de migration ne contient pas de propriétaire valide; inspection arrêtée.",
    );
  }
  if (processIsAlive(parsed.pid)) {
    throw new Error(
      `Une migration est en cours dans le processus ${parsed.pid}; inspection arrêtée.`,
    );
  }
  return "recovery-required";
}

/** Explicit stale-lock recovery. The caller must present the owner information
 * and obtain a deliberate confirmation before invoking this function. */
export async function releaseStaleMigrationLock(
  directory: string,
  confirm: (owner: { pid?: number; startedAt?: string; malformed: boolean }) => Promise<boolean>,
): Promise<boolean> {
  const lockPath = join(resolve(directory), LOCK);
  if (!(await exists(lockPath))) {
    return false;
  }
  const raw = await readFile(lockPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  const owner = {
    pid: isRecord(parsed) && typeof parsed.pid === "number" ? parsed.pid : undefined,
    startedAt:
      isRecord(parsed) && typeof parsed.startedAt === "string" ? parsed.startedAt : undefined,
    malformed: !isRecord(parsed),
  };
  if (owner.pid !== undefined && processIsAlive(owner.pid)) {
    throw new Error(`Le processus PID ${owner.pid} utilise encore ce jeu de données.`);
  }
  if (!(await confirm(owner))) {
    return false;
  }
  if ((await readFile(lockPath, "utf8")) !== raw) {
    throw new Error("Le verrou a changé pendant la vérification; recommencez la récupération.");
  }
  if (await exists(join(dirname(lockPath), JOURNAL))) {
    await recoverMigration(directory);
    return true;
  }
  await rm(lockPath);
  return true;
}

async function finishJournal(directory: string, journal: Record<string, unknown>): Promise<void> {
  if (typeof journal.id !== "string" || !UUID.test(journal.id)) {
    throw new Error("Le journal de migration ne contient pas un identifiant valide.");
  }
  const receipt = journal.receipt;
  if (
    !isRecord(receipt) ||
    receipt.migrationId !== journal.id ||
    typeof receipt.sourceSchema !== "number" ||
    receipt.targetSchema !== 8 ||
    typeof receipt.backupPath !== "string" ||
    typeof receipt.completedAt !== "string" ||
    !isRecord(receipt.counts)
  ) {
    throw new Error("Le journal de migration ne contient pas de reçu de fin valide.");
  }
  const files = journal.files as unknown[];
  const normalized = files
    .map((entry) => {
      if (
        !isRecord(entry) ||
        typeof entry.temporary !== "string" ||
        typeof entry.target !== "string" ||
        typeof entry.manifest !== "boolean"
      ) {
        throw new Error("Le journal de migration contient une opération invalide.");
      }
      return {
        temporary: checkedBasename(entry.temporary),
        target: checkedBasename(entry.target),
        manifest: entry.manifest,
      };
    })
    .sort((a, b) => Number(a.manifest) - Number(b.manifest));
  const targets = new Set<string>();
  if (
    normalized.length === 0 ||
    normalized.filter((operation) => operation.manifest).length !== 1 ||
    normalized.some((operation) => {
      const expectedTemporary = `.${operation.target}.${journal.id}.migration-tmp`;
      if (
        !CURRENT_TARGETS.has(operation.target) ||
        operation.temporary !== expectedTemporary ||
        operation.manifest !== (operation.target === "dataset.json") ||
        targets.has(operation.target)
      ) {
        return true;
      }
      targets.add(operation.target);
      return false;
    })
  ) {
    throw new Error("Le journal de migration contient des cibles inattendues ou dupliquées.");
  }
  if (
    !Array.isArray(journal.retiredFiles) ||
    journal.retiredFiles.some((file) => typeof file !== "string" || !RETIRED_TARGETS.has(file))
  ) {
    throw new Error("Le journal de migration contient des fichiers retirés inattendus.");
  }
  for (const operation of normalized) {
    const temporary = join(directory, operation.temporary);
    if (await exists(temporary)) {
      await rename(temporary, join(directory, operation.target));
    } else if (!(await exists(join(directory, operation.target)))) {
      throw new Error(`Récupération impossible : ${operation.target} est absent.`);
    }
  }
  for (const file of journal.retiredFiles as string[]) {
    await rm(join(directory, checkedBasename(file)), { force: true });
  }
  await writeFile(
    join(directory, ".model-migration-receipt.json"),
    JSON.stringify(receipt, null, 2),
  );
  await rm(join(directory, JOURNAL), { force: true });
}

async function createVerifiedBackup(directory: string, id: string): Promise<string> {
  const backupPath = backupLocation(directory, id);
  await mkdir(backupPath, { recursive: false });
  const original: Array<{ path: string; sha256: string; size: number }> = [];
  await inventory(directory, directory, original);
  await copyTree(directory, backupPath, directory);
  const check: Array<{ path: string; sha256: string; size: number }> = [];
  await inventory(backupPath, backupPath, check);
  const expected = new Map(original.map((entry) => [entry.path, `${entry.sha256}:${entry.size}`]));
  if (
    expected.size !== check.length ||
    check.some((entry) => expected.get(entry.path) !== `${entry.sha256}:${entry.size}`)
  ) {
    throw new Error("La vérification de la sauvegarde pré-migration a échoué.");
  }
  await writeFile(
    join(backupPath, `.model-migration-inventory-${id}.json`),
    JSON.stringify(original, null, 2),
    { flag: "wx" },
  );
  return backupPath;
}

async function copyTree(source: string, target: string, rootSource: string): Promise<void> {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (source === rootSource && entry.name === LOCK) {
      continue;
    }
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true });
      await copyTree(from, to, rootSource);
    } else if (entry.isFile()) {
      await copyFile(from, to);
    } else {
      throw new Error(`La sauvegarde ne peut pas préserver l'entrée spéciale ${from}.`);
    }
  }
}

async function inventory(
  root: string,
  current: string,
  output: Array<{ path: string; sha256: string; size: number }>,
): Promise<void> {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (current === root && entry.name === LOCK) {
      continue;
    }
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      await inventory(root, path, output);
    } else if (entry.isFile()) {
      const bytes = await readFile(path);
      output.push({
        path: relative(root, path).split(sep).join("/"),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        size: bytes.length,
      });
    } else if (!entry.isFile()) {
      throw new Error(`La sauvegarde ne peut pas inventorier l'entrée spéciale ${path}.`);
    }
  }
}

function backupLocation(directory: string, id: string): string {
  return join(dirname(directory), `${basename(directory)}.legacy-backup-${id}`);
}

async function assertNoLiveMigrationOwner(directory: string): Promise<void> {
  const lockPath = join(directory, LOCK);
  if (!(await exists(lockPath))) {
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(lockPath, "utf8"));
  } catch {
    throw new Error("Le verrou de migration est illisible; récupération refusée.");
  }
  if (isRecord(parsed) && typeof parsed.pid === "number" && processIsAlive(parsed.pid)) {
    throw new Error(`Le processus PID ${parsed.pid} utilise encore ce jeu de données.`);
  }
}

function checkedBasename(value: string): string {
  if (
    !value ||
    value === "." ||
    value === ".." ||
    basename(value) !== value ||
    value.includes("/") ||
    value.includes("\\")
  ) {
    throw new Error(
      "Le journal de migration contient un chemin hors du dossier du jeu de données.",
    );
  }
  return value;
}
async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}
