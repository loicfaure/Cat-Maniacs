import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { csvToRecords } from "../../core/csv";
import { type LegacySchema } from "../../legacy/migration/legacyFormat";
import { mapLegacyDataset } from "../../legacy/migration/mapLegacy";
import {
  inspectLegacyDataset,
  type LegacyDatasetInspection,
  readLegacyTables,
} from "./inspectLegacy";
import {
  retiredLegacyFiles,
  serializeMigratedDataset,
  type TargetMigrationTable,
} from "./serializeMigration";
import {
  checkMigrationRecovery,
  commitMigration,
  type MigrationReceipt,
  recoverStaleMigrationBeforeInspection,
} from "./transaction";

export type MigrationRunResult =
  | { status: "dry-run"; inspection: LegacyDatasetInspection }
  | { status: "current"; inspection: LegacyDatasetInspection }
  | { status: "cancelled"; inspection: LegacyDatasetInspection }
  | { status: "migrated"; inspection: LegacyDatasetInspection; receipt: MigrationReceipt };

export class MigrationFormatError extends Error {}
export class MigrationValidationError extends Error {}

export async function runLegacyMigration(options: {
  directory: string;
  dryRun?: boolean;
  confirm?: (inspection: LegacyDatasetInspection) => Promise<boolean>;
  tables: readonly TargetMigrationTable[];
  validateStaged: (directory: string) => Promise<void>;
}): Promise<MigrationRunResult> {
  if (options.dryRun) {
    const recovery = await checkMigrationRecovery(options.directory);
    if (recovery === "recovery-required") {
      return {
        status: "dry-run",
        inspection: {
          directory: options.directory,
          format: "malformed",
          counts: {},
          problems: [
            "Une migration interrompue doit être récupérée avant l'inspection en lecture seule.",
          ],
          hasUnfinishedTransaction: true,
        },
      };
    }
  } else {
    await recoverStaleMigrationBeforeInspection(options.directory);
  }
  const inspection = await inspectLegacyDataset(options.directory);
  if (inspection.format === "current") {
    return { status: "current", inspection };
  }
  if (inspection.format !== "legacy" || !inspection.sourceSchema) {
    throw new MigrationFormatError(
      inspection.problems.join(" ") ||
        "Le dossier ne contient pas un jeu de données historique pris en charge.",
    );
  }
  if (options.dryRun) {
    if (inspection.hasUnfinishedTransaction) {
      return { status: "dry-run", inspection };
    }
    try {
      const mapped = await readAndMap(options.directory, inspection.sourceSchema as LegacySchema);
      return { status: "dry-run", inspection: { ...inspection, counts: mapped.counts } };
    } catch (error) {
      const problem = error instanceof Error ? error.message : String(error);
      return {
        status: "dry-run",
        inspection: { ...inspection, problems: [...inspection.problems, problem] },
      };
    }
  }
  if (!options.confirm || !(await options.confirm(inspection))) {
    return { status: "cancelled", inspection };
  }

  const sourceSchema = inspection.sourceSchema as LegacySchema;
  let expectedTables: Map<string, Array<Record<string, string>>> | undefined;
  const receipt = await commitMigration({
    directory: options.directory,
    sourceSchema,
    retiredFiles: retiredLegacyFiles(options.tables),
    prepare: async () => {
      // This runs after exclusive access, verified backup, and recovery of an
      // unfinished schema-3/7 repository transaction.
      const mapped = await readAndMap(options.directory, sourceSchema);
      expectedTables = mapped.tables;
      return {
        files: serializeMigratedDataset(mapped, options.tables),
        counts: mapped.counts,
      };
    },
    validateStaged: async (directory) => {
      if (!expectedTables) {
        throw new Error("Les données attendues pour la validation de migration sont absentes.");
      }
      await verifyStagedRecords(directory, expectedTables, options.tables);
      await options.validateStaged(directory);
    },
  });
  return { status: "migrated", inspection, receipt };
}

async function readAndMap(directory: string, schema: LegacySchema) {
  try {
    const raw = JSON.parse(await readFile(join(directory, "dataset.json"), "utf8")) as Record<
      string,
      unknown
    >;
    const source = await readLegacyTables(directory, schema);
    return mapLegacyDataset(source, raw, schema);
  } catch (error) {
    throw new MigrationValidationError(error instanceof Error ? error.message : String(error));
  }
}

async function verifyStagedRecords(
  directory: string,
  expected: Map<string, Array<Record<string, string>>>,
  tables: readonly TargetMigrationTable[],
): Promise<void> {
  for (const table of tables) {
    const expectedRows = expected.get(table.key) ?? [];
    const actualRows = csvToRecords(await readFile(join(directory, table.file), "utf8"));
    if (actualRows.length !== expectedRows.length) {
      throw new Error(
        `${table.file} : le nombre de lignes (${actualRows.length}) diffère du rapport (${expectedRows.length}).`,
      );
    }
    const ids = new Set<string>();
    for (let index = 0; index < expectedRows.length; index += 1) {
      const expectedRow = expectedRows[index]!;
      const actualRow = actualRows[index]!;
      if ("id" in expectedRow) {
        if (!expectedRow.id || ids.has(expectedRow.id)) {
          throw new Error(`${table.file} : identifiant vide ou dupliqué (${expectedRow.id}).`);
        }
        ids.add(expectedRow.id);
      }
      for (const header of table.headers) {
        const expectedValue = expectedRow[header] ?? "";
        if ((actualRow[header] ?? "") !== expectedValue) {
          throw new Error(
            `${table.file} ligne ${index + 2} : la valeur ${header} n'a pas été conservée lors de la sérialisation.`,
          );
        }
      }
    }
  }
}
