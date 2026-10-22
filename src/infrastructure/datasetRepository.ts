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
import { join } from "node:path";
import type { DatasetRepositoryPort } from "../application/ports/datasetRepository";
import { csvToRecords, parseCsv, stringifyCsv } from "../core/csv";
import type { Dataset } from "../core/types";
import {
  CURRENT_SCHEMA_VERSION,
  createEmptyDataset,
  validateDatasetReferences,
} from "../domain/dataset";
import { parseDatasetManifest, parseTransactionJournal } from "./database/json";
import { type CsvTableRecord, loadDatasetTable, serializeDatasetTable } from "./database/records";
import { TABLES } from "./database/tables";
import type { DatasetManifest, TransactionFile } from "./database/types";
import { recoverStaleMigrationBeforeInspection } from "./migrations/transaction";

export class DatasetRepository implements DatasetRepositoryPort {
  static async recoverPendingMigration(directory: string): Promise<void> {
    await recoverStaleMigrationBeforeInspection(directory);
  }

  private constructor(public readonly directory: string) {}

  static async open(
    directory: string,
  ): Promise<{ repository: DatasetRepository; dataset: Dataset }> {
    const repository = new DatasetRepository(directory);
    await recoverStaleMigrationBeforeInspection(directory);
    const manifestPath = join(directory, "dataset.json");
    if (!(await exists(manifestPath))) {
      await mkdir(directory, { recursive: true });
      const dataset = createEmptyDataset();
      await repository.save(dataset, false);
      return { repository, dataset };
    }
    const rawManifest: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!rawManifest || typeof rawManifest !== "object" || !("modelVersion" in rawManifest)) {
      throw new Error(
        "Ce jeu de données ancien doit être sauvegardé et converti vers le modèle animal v1 avant son ouverture.",
      );
    }
    const versionFields = rawManifest as Record<string, unknown>;
    if (
      versionFields.modelVersion !== 1 ||
      versionFields.schemaVersion !== CURRENT_SCHEMA_VERSION
    ) {
      if (
        typeof versionFields.schemaVersion === "number" &&
        versionFields.schemaVersion > CURRENT_SCHEMA_VERSION
      ) {
        throw new Error(
          "Ce jeu de données a été créé par une version plus récente de l'application.",
        );
      }
      throw new Error(
        "Le format de ce jeu de données nécessite une migration avant son ouverture.",
      );
    }
    await mkdir(directory, { recursive: true });
    await repository.recoverTransaction();
    const dataset = await repository.load();
    return { repository, dataset };
  }

  /** Demo reset intentionally replaces the isolated demo register without
   * parsing obsolete animal tables that may predate model v1. */
  static async openDemo(
    directory: string,
    dataset: Dataset,
  ): Promise<{ repository: DatasetRepository; dataset: Dataset }> {
    const repository = new DatasetRepository(directory);
    await recoverStaleMigrationBeforeInspection(directory);
    await mkdir(directory, { recursive: true });
    await repository.recoverTransaction();
    await repository.save(dataset, false);
    return { repository, dataset };
  }

  async load(): Promise<Dataset> {
    const manifest = parseDatasetManifest(
      await readFile(join(this.directory, "dataset.json"), "utf8"),
    );
    if (manifest.modelVersion !== 1 || manifest.schemaVersion > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        "Ce jeu de données a été créé par une version plus récente de l'application.",
      );
    }
    if (manifest.schemaVersion < CURRENT_SCHEMA_VERSION) {
      throw new Error("Une migration est requise avant l'ouverture de ce jeu de données.");
    }

    const dataset = emptyFromManifest(manifest);
    for (const table of TABLES) {
      const records = await this.readOptionalTable(table.file, table.headers);
      loadDatasetTable(table.key, dataset, records);
    }
    this.assertReferences(dataset);
    return dataset;
  }

  async save(dataset: Dataset, createBackup = true): Promise<void> {
    await recoverStaleMigrationBeforeInspection(this.directory);
    await mkdir(this.directory, { recursive: true });
    if (createBackup) {
      await this.backupCurrentFiles();
    }
    const transactionId = crypto.randomUUID();
    const files: TransactionFile[] = [];
    for (const table of TABLES) {
      const target = join(this.directory, table.file);
      const temporary = `${target}.${transactionId}.tmp`;
      const records = serializeDatasetTable(table.key, dataset);
      await writeFile(temporary, stringifyCsv(table.headers, records), "utf8");
      files.push({ temporary, target });
    }
    const manifestTarget = join(this.directory, "dataset.json");
    const manifestTemporary = `${manifestTarget}.${transactionId}.tmp`;
    const manifest = {
      modelVersion: dataset.modelVersion,
      schemaVersion: dataset.schemaVersion,
      datasetId: dataset.datasetId,
      name: dataset.name,
      createdAt: dataset.createdAt,
      updatedAt: dataset.updatedAt,
      settings: dataset.settings,
    };
    await writeFile(manifestTemporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    files.push({ temporary: manifestTemporary, target: manifestTarget });
    const journalPath = join(this.directory, ".transaction.json");
    await writeFile(journalPath, JSON.stringify({ id: transactionId, files }), "utf8");
    for (const file of files) {
      await rename(file.temporary, file.target);
    }
    await rm(journalPath, { force: true });
  }

  private async readOptionalTable(
    file: string,
    expectedHeaders: readonly string[],
  ): Promise<CsvTableRecord[]> {
    const path = join(this.directory, file);
    if (!(await exists(path))) {
      throw new Error(`Table requise absente : ${file}.`);
    }
    const contents = await readFile(path, "utf8");
    const parsed = parseCsv(contents);
    const headers = parsed.rows[0] ?? [];
    if (
      headers.length !== expectedHeaders.length ||
      headers.some((header, index) => header !== expectedHeaders[index])
    ) {
      throw new Error(
        `En-têtes invalides dans ${file}; le fichier peut appartenir à un autre format.`,
      );
    }
    return csvToRecords(contents);
  }
  private assertReferences(dataset: Dataset): void {
    const errors = validateDatasetReferences(dataset);
    if (errors.length) {
      throw new Error(`Jeu de données incohérent : ${errors.join(" ")}`);
    }
  }
  private async recoverTransaction(): Promise<void> {
    const journalPath = join(this.directory, ".transaction.json");
    if (!(await exists(journalPath))) {
      return;
    }
    const transaction = parseTransactionJournal(await readFile(journalPath, "utf8"));
    for (const file of transaction.files) {
      if (await exists(file.temporary)) {
        await rename(file.temporary, file.target);
      }
    }
    await rm(journalPath, { force: true });
  }
  private async backupCurrentFiles(): Promise<void> {
    if (!(await exists(join(this.directory, "dataset.json")))) {
      return;
    }
    const backup = join(this.directory, "backups", new Date().toISOString().replace(/[:.]/g, "-"));
    await mkdir(backup, { recursive: true });
    for (const file of [
      "dataset.json",
      ...new Set([...TABLES.map((table) => table.file), "families.csv"]),
    ]) {
      const source = join(this.directory, file);
      if (await exists(source)) {
        await copyFile(source, join(backup, file));
      }
    }
    const root = join(this.directory, "backups");
    const directories = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const old of directories.slice(0, -20)) {
      await rm(join(root, old), { recursive: true });
    }
  }
}

function emptyFromManifest(manifest: DatasetManifest): Dataset {
  const base = createEmptyDataset(manifest.name);
  return {
    ...base,
    ...manifest,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    refugeZones: base.refugeZones,
  };
}
async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
